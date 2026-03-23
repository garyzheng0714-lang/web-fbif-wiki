package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

const (
	defaultListenHost       = "127.0.0.1"
	defaultListenPort       = "5173"
	defaultKnowledgeBaseURL = "https://api-knowledgebase.mlp.cn-beijing.volces.com"
	serviceChatPath         = "/api/knowledge/service/chat"
	cozeChatURL             = "https://api.coze.cn/v3/chat"
	maxRequestBodyBytes     = 1 << 20 // 1 MB
	maxScannerTokenBytes    = 2 << 20 // 2 MB
)

type config struct {
	Host              string
	Port              string
	KnowledgeBaseURL  string
	APIKey            string
	ServiceResourceID string
	CozeAPIKey        string
	CozeBotID         string
	UpstreamTimeout   time.Duration
}

// ── Volc types ──────────────────────────────────────────────────────────────

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

// ── Coze types ───────────────────────────────────────────────────────────────

type cozeMessage struct {
	Role        string `json:"role"`
	Content     string `json:"content"`
	ContentType string `json:"content_type"`
}

type cozeChatRequest struct {
	BotID              string        `json:"bot_id"`
	UserID             string        `json:"user_id"`
	Stream             bool          `json:"stream"`
	AutoSaveHistory    bool          `json:"auto_save_history"`
	AdditionalMessages []cozeMessage `json:"additional_messages"`
}

type cozeDeltaData struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
	if cfg.CozeAPIKey != "" {
		log.Printf("using Coze API (bot_id=%s)", cfg.CozeBotID)
	} else if cfg.APIKey == "" || cfg.ServiceResourceID == "" {
		log.Printf("warning: no AI backend configured; set COZE_API_KEY+COZE_BOT_ID or VOLC_API_KEY+VOLC_SERVICE_RESOURCE_ID")
	}

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func newMux(cfg config, client *http.Client) *http.ServeMux {
	mux := http.NewServeMux()
	fileServer := http.FileServer(http.Dir("."))

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		cozeConfigured := cfg.CozeAPIKey != "" && cfg.CozeBotID != ""
		volcConfigured := cfg.APIKey != "" && cfg.ServiceResourceID != ""
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":     "ok",
			"configured": cozeConfigured || volcConfigured,
		})
	})

	mux.HandleFunc("/api/chat/stream", func(w http.ResponseWriter, r *http.Request) {
		handleChatStream(w, r, cfg, client)
	})

	unfurlClient := &http.Client{Timeout: 10 * time.Second}
	mux.HandleFunc("/api/unfurl", func(w http.ResponseWriter, r *http.Request) {
		handleUnfurl(w, r, unfurlClient)
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

// ── Chat handler ─────────────────────────────────────────────────────────────

func handleChatStream(w http.ResponseWriter, r *http.Request, cfg config, client *http.Client) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
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

	if cfg.CozeAPIKey != "" {
		handleCozeStream(w, r, input, userMessage, cfg, client)
	} else {
		handleVolcStream(w, r, input, userMessage, cfg, client)
	}
}

// ── Coze ─────────────────────────────────────────────────────────────────────

func handleCozeStream(w http.ResponseWriter, r *http.Request, input chatRequest, userMessage string, cfg config, client *http.Client) {
	messages := buildCozeMessages(input.History, userMessage)
	upstreamReq := cozeChatRequest{
		BotID:              cfg.CozeBotID,
		UserID:             "fbif-user",
		Stream:             true,
		AutoSaveHistory:    false,
		AdditionalMessages: messages,
	}

	body, err := json.Marshal(upstreamReq)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to marshal request"})
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, cozeChatURL, bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create request"})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.CozeAPIKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("coze request failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "coze request failed"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		upstreamBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error":  "coze returned error",
			"detail": strings.TrimSpace(string(upstreamBody)),
		})
		return
	}

	if err := streamCozeResponse(w, resp.Body); err != nil {
		log.Printf("coze stream error: %v", err)
	}
}

func buildCozeMessages(history []chatRecord, userMessage string) []cozeMessage {
	msgs := make([]cozeMessage, 0, len(history)+1)
	for _, item := range history {
		role := strings.TrimSpace(strings.ToLower(item.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		content := strings.TrimSpace(item.Content)
		if content == "" {
			continue
		}
		msgs = append(msgs, cozeMessage{Role: role, Content: content, ContentType: "text"})
	}
	msgs = append(msgs, cozeMessage{Role: "user", Content: strings.TrimSpace(userMessage), ContentType: "text"})
	return msgs
}

func streamCozeResponse(w http.ResponseWriter, upstream io.Reader) error {
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

	var finalAnswer string

	for scanner.Scan() {
		frame := scanner.Text()
		eventType, payload := extractSSEFrame(frame)

		if payload == "" || payload == "[DONE]" {
			if payload == "[DONE]" {
				break
			}
			continue
		}

		switch eventType {
		case "conversation.message.delta":
			var msg cozeDeltaData
			if err := json.Unmarshal([]byte(payload), &msg); err != nil {
				continue
			}
			if msg.Type == "answer" && msg.Content != "" {
				if err := writeSSE(w, "token", map[string]string{"token": msg.Content}); err != nil {
					return err
				}
				flusher.Flush()
			}

		case "conversation.message.completed":
			var msg cozeDeltaData
			if err := json.Unmarshal([]byte(payload), &msg); err != nil {
				continue
			}
			if msg.Type == "answer" {
				finalAnswer = msg.Content
			}

		case "conversation.chat.failed":
			_ = writeSSE(w, "error", map[string]string{"error": "coze chat failed"})
			flusher.Flush()
			return errors.New("coze chat failed")
		}
	}

	if err := scanner.Err(); err != nil {
		_ = writeSSE(w, "error", map[string]string{"error": "upstream stream interrupted"})
		flusher.Flush()
		return err
	}

	if err := writeSSE(w, "done", map[string]string{"answer": finalAnswer}); err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

// ── Volc ─────────────────────────────────────────────────────────────────────

func handleVolcStream(w http.ResponseWriter, r *http.Request, input chatRequest, userMessage string, cfg config, client *http.Client) {
	if cfg.APIKey == "" || cfg.ServiceResourceID == "" {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "no AI backend configured; set COZE_API_KEY+COZE_BOT_ID or VOLC_API_KEY+VOLC_SERVICE_RESOURCE_ID",
		})
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

// ── SSE helpers ───────────────────────────────────────────────────────────────

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

// extractSSEFrame returns the event type and data payload from a raw SSE frame.
func extractSSEFrame(frame string) (event, data string) {
	event = "message"
	var dataLines []string
	for _, line := range strings.Split(strings.ReplaceAll(frame, "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	return event, strings.TrimSpace(strings.Join(dataLines, "\n"))
}

// extractDataPayload returns only the data payload (used by Volc handler).
func extractDataPayload(frame string) string {
	_, data := extractSSEFrame(frame)
	return data
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

// ── Config ────────────────────────────────────────────────────────────────────

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
		CozeAPIKey:        strings.TrimSpace(os.Getenv("COZE_API_KEY")),
		CozeBotID:         strings.TrimSpace(os.Getenv("COZE_BOT_ID")),
		UpstreamTimeout:   timeout,
	}
}

func joinURL(base string, path string) string {
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}

// ── Unfurl ────────────────────────────────────────────────────────────────────

type unfurlResult struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
}

func handleUnfurl(w http.ResponseWriter, r *http.Request, client *http.Client) {
	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url required"})
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid url"})
		return
	}

	if isPrivateHost(parsed.Hostname()) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "disallowed host"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid url"})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; FBIFBot/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,*/*")

	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "fetch failed"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "read failed"})
		return
	}

	content := string(body)
	result := unfurlResult{URL: rawURL}
	result.Title = extractOGMeta(content, "og:title")
	result.Description = extractOGMeta(content, "og:description")
	result.Image = extractOGMeta(content, "og:image")
	if result.Title == "" {
		result.Title = extractHTMLTitle(content)
	}

	writeJSON(w, http.StatusOK, result)
}

func extractOGMeta(content, property string) string {
	prop := regexp.QuoteMeta(property)
	patterns := []string{
		`(?i)<meta[^>]+property=["']` + prop + `["'][^>]+content=["']([^"'>]{1,500})["']`,
		`(?i)<meta[^>]+content=["']([^"'>]{1,500})["'][^>]+property=["']` + prop + `["']`,
	}
	for _, pattern := range patterns {
		if m := regexp.MustCompile(pattern).FindStringSubmatch(content); len(m) > 1 {
			return html.UnescapeString(strings.TrimSpace(m[1]))
		}
	}
	return ""
}

func extractHTMLTitle(content string) string {
	re := regexp.MustCompile(`(?i)<title[^>]*>([^<]{1,200})</title>`)
	if m := re.FindStringSubmatch(content); len(m) > 1 {
		return html.UnescapeString(strings.TrimSpace(m[1]))
	}
	return ""
}

func isPrivateHost(host string) bool {
	lower := strings.ToLower(strings.TrimSpace(host))
	for _, exact := range []string{"localhost", "127.0.0.1", "::1", "0.0.0.0"} {
		if lower == exact {
			return true
		}
	}
	for _, prefix := range []string{
		"10.", "192.168.",
		"172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
		"172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
		"172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
	} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}
