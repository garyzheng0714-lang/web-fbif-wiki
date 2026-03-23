package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultListenHost       = "127.0.0.1"
	defaultListenPort       = "5173"
	defaultKnowledgeBaseURL = "https://api-knowledgebase.mlp.cn-beijing.volces.com"
	serviceChatPath         = "/api/knowledge/service/chat"
	maxRequestBodyBytes     = 1 << 20 // 1 MB
	maxScannerTokenBytes    = 2 << 20 // 2 MB
)

type config struct {
	Host              string
	Port              string
	KnowledgeBaseURL  string
	APIKey            string
	ServiceResourceID string
	UpstreamTimeout   time.Duration
}

type chatRequest struct {
	Message    string       `json:"message"`
	History    []chatRecord `json:"history,omitempty"`
	QueryParam *queryParam  `json:"query_param,omitempty"`
}

type chatRecord struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type queryParam struct {
	DocFilter interface{} `json:"doc_filter,omitempty"`
}

type messageParam struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type serviceChatRequest struct {
	ServiceResourceID string         `json:"service_resource_id,omitempty"`
	Stream            bool           `json:"stream"`
	Messages          []messageParam `json:"messages"`
	QueryParam        *queryParam    `json:"query_param,omitempty"`
}

type serviceChatResponse struct {
	Code    int64                `json:"code"`
	Message string               `json:"message,omitempty"`
	Data    *serviceChatRespData `json:"data,omitempty"`
}

type serviceChatRespData struct {
	GenerateAnswer string `json:"generated_answer"`
	End            bool   `json:"end,omitempty"`
}

func main() {
	cfg := loadConfig()
	client := &http.Client{Timeout: cfg.UpstreamTimeout}

	addr := cfg.Host + ":" + cfg.Port
	server := &http.Server{
		Addr:              addr,
		Handler:           newMux(cfg, client),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("FBIF wiki server running at http://%s", addr)
	if cfg.APIKey == "" || cfg.ServiceResourceID == "" {
		log.Printf("warning: VOLC_API_KEY or VOLC_SERVICE_RESOURCE_ID is empty; /api/chat/stream will return config errors")
	}

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func newMux(cfg config, client *http.Client) *http.ServeMux {
	mux := http.NewServeMux()
	fileServer := http.FileServer(http.Dir("."))

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/api/chat/stream", func(w http.ResponseWriter, r *http.Request) {
		handleChatStream(w, r, cfg, client)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/preview/fbif-chat-brand.html", http.StatusFound)
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	return mux
}

func handleChatStream(w http.ResponseWriter, r *http.Request, cfg config, client *http.Client) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	if cfg.APIKey == "" || cfg.ServiceResourceID == "" {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "missing VOLC_API_KEY or VOLC_SERVICE_RESOURCE_ID",
		})
		return
	}

	var input chatRequest
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxRequestBodyBytes))
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	userMessage := strings.TrimSpace(input.Message)
	if userMessage == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message is required"})
		return
	}

	messages := normalizeMessages(input.History, userMessage)
	upstreamReq := serviceChatRequest{
		ServiceResourceID: cfg.ServiceResourceID,
		Stream:            true,
		Messages:          messages,
		QueryParam:        input.QueryParam,
	}

	body, err := json.Marshal(upstreamReq)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to marshal upstream request"})
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, joinURL(cfg.KnowledgeBaseURL, serviceChatPath), bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create upstream request"})
		return
	}

	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("upstream request failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream request failed"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		upstreamBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error":  "upstream service returned error",
			"detail": strings.TrimSpace(string(upstreamBody)),
		})
		return
	}

	if err := streamUpstreamResponse(w, resp.Body); err != nil {
		log.Printf("stream error: %v", err)
	}
}

func streamUpstreamResponse(w http.ResponseWriter, upstream io.Reader) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return errors.New("streaming unsupported by response writer")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	scanner := bufio.NewScanner(upstream)
	scanner.Split(scanDoubleCRLF)
	scanner.Buffer(make([]byte, 0, 128*1024), maxScannerTokenBytes)

	var answerBuilder strings.Builder

	for scanner.Scan() {
		frame := scanner.Text()
		payload := extractDataPayload(frame)
		if payload == "" {
			continue
		}

		if payload == "[DONE]" {
			break
		}

		var chunk serviceChatResponse
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			_ = writeSSE(w, "error", map[string]string{"error": "failed to parse upstream stream payload"})
			flusher.Flush()
			return err
		}

		if chunk.Code != 0 {
			msg := strings.TrimSpace(chunk.Message)
			if msg == "" {
				msg = "upstream returned non-zero code"
			}
			_ = writeSSE(w, "error", map[string]string{"error": msg})
			flusher.Flush()
			return fmt.Errorf("upstream code=%d message=%s", chunk.Code, msg)
		}

		if chunk.Data == nil {
			continue
		}

		if token := chunk.Data.GenerateAnswer; token != "" {
			answerBuilder.WriteString(token)
			if err := writeSSE(w, "token", map[string]string{"token": token}); err != nil {
				return err
			}
			flusher.Flush()
		}

		if chunk.Data.End {
			break
		}
	}

	if err := scanner.Err(); err != nil {
		_ = writeSSE(w, "error", map[string]string{"error": "upstream stream interrupted"})
		flusher.Flush()
		return err
	}

	if err := writeSSE(w, "done", map[string]string{"answer": answerBuilder.String()}); err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

func normalizeMessages(history []chatRecord, userMessage string) []messageParam {
	messages := make([]messageParam, 0, len(history)+1)
	for _, item := range history {
		role := strings.TrimSpace(strings.ToLower(item.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		content := strings.TrimSpace(item.Content)
		if content == "" {
			continue
		}
		messages = append(messages, messageParam{Role: role, Content: content})
	}

	messages = append(messages, messageParam{Role: "user", Content: strings.TrimSpace(userMessage)})
	return messages
}

// scanDoubleCRLF is a bufio.SplitFunc that splits stream blocks by empty line.
func scanDoubleCRLF(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if i := bytes.Index(data, []byte("\r\n\r\n")); i >= 0 {
		return i + 4, data[:i], nil
	}
	if i := bytes.Index(data, []byte("\n\n")); i >= 0 {
		return i + 2, data[:i], nil
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func extractDataPayload(frame string) string {
	normalized := strings.ReplaceAll(frame, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	payloadLines := make([]string, 0, 2)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "data:") {
			payloadLines = append(payloadLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}

	return strings.TrimSpace(strings.Join(payloadLines, "\n"))
}

func writeSSE(w http.ResponseWriter, event string, payload interface{}) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if event != "" {
		if _, err := fmt.Fprintf(w, "event: %s\n", event); err != nil {
			return err
		}
	}

	_, err = fmt.Fprintf(w, "data: %s\n\n", payloadBytes)
	return err
}

func writeJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func loadConfig() config {
	host := strings.TrimSpace(os.Getenv("HOST"))
	if host == "" {
		host = defaultListenHost
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = defaultListenPort
	}

	kbURL := strings.TrimSpace(os.Getenv("VOLC_KNOWLEDGE_BASE_ENDPOINT"))
	if kbURL == "" {
		kbURL = defaultKnowledgeBaseURL
	}

	timeout := 600 * time.Second
	if rawTimeout := strings.TrimSpace(os.Getenv("UPSTREAM_TIMEOUT_SECONDS")); rawTimeout != "" {
		if parsed, err := time.ParseDuration(rawTimeout + "s"); err == nil && parsed > 0 {
			timeout = parsed
		}
	}

	return config{
		Host:              host,
		Port:              port,
		KnowledgeBaseURL:  kbURL,
		APIKey:            strings.TrimSpace(os.Getenv("VOLC_API_KEY")),
		ServiceResourceID: strings.TrimSpace(os.Getenv("VOLC_SERVICE_RESOURCE_ID")),
		UpstreamTimeout:   timeout,
	}
}

func joinURL(base string, path string) string {
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}
