package volcengine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	baseURL   string
	apiKey    string
	serviceID string
	http      *http.Client
}

func NewClient(baseURL, apiKey, serviceID string) *Client {
	return &Client{
		baseURL:   baseURL,
		apiKey:    apiKey,
		serviceID: serviceID,
		http:      &http.Client{Timeout: 120 * time.Second},
	}
}

// ChatRequest is the request body for the knowledge service chat API.
type ChatRequest struct {
	ServiceResourceID string       `json:"service_resource_id"`
	Stream            bool         `json:"stream"`
	Messages          []Message    `json:"messages"`
	QueryParam        *QueryParam  `json:"query_param,omitempty"`
}

type Message struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type QueryParam struct {
	DocFilter interface{} `json:"doc_filter,omitempty"`
}

// ChatResponse is the non-streaming response.
type ChatResponse struct {
	Code    int64            `json:"code"`
	Message string           `json:"message,omitempty"`
	Data    *ChatData        `json:"data,omitempty"`
}

type ChatData struct {
	Count            int32              `json:"count"`
	RewriteQuery     string             `json:"rewrite_query,omitempty"`
	TokenUsage       json.RawMessage    `json:"token_usage,omitempty"`
	ResultList       []SearchResultItem `json:"result_list,omitempty"`
	GeneratedAnswer  string             `json:"generated_answer,omitempty"`
	ReasoningContent string             `json:"reasoning_content,omitempty"`
	End              bool               `json:"end,omitempty"`
	Images           map[string]string  `json:"images,omitempty"` // point_id -> image URL (populated by handler)
}

type SearchResultItem struct {
	PointID         string            `json:"point_id"`
	Content         string            `json:"content"`
	ChunkType       string            `json:"chunk_type,omitempty"`
	ChunkAttachment []ChunkAttachment `json:"chunk_attachment,omitempty"`
}

type ChunkAttachment struct {
	UUID    string `json:"uuid,omitempty"`
	Caption string `json:"caption,omitempty"`
	Type    string `json:"type,omitempty"`
	Link    string `json:"link,omitempty"`
}

// Chat sends a non-streaming chat request.
func (c *Client) Chat(messages []Message) (*ChatResponse, error) {
	req := ChatRequest{
		ServiceResourceID: c.serviceID,
		Stream:            false,
		Messages:          messages,
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", c.baseURL+"/api/knowledge/service/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var chatResp ChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	if chatResp.Code != 0 {
		return nil, fmt.Errorf("API error code=%d: %s", chatResp.Code, chatResp.Message)
	}
	return &chatResp, nil
}

// ChatStream sends a streaming chat request and returns the raw response body.
// Caller is responsible for closing the body.
func (c *Client) ChatStream(messages []Message) (io.ReadCloser, error) {
	req := ChatRequest{
		ServiceResourceID: c.serviceID,
		Stream:            true,
		Messages:          messages,
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", c.baseURL+"/api/knowledge/service/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	// Use a separate client without timeout for streaming
	streamClient := &http.Client{Timeout: 600 * time.Second}
	resp, err := streamClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	return resp.Body, nil
}
