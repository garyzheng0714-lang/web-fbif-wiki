package feishu

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

const (
	baseURL           = "https://open.feishu.cn/open-apis"
	tokenPath         = "/auth/v3/tenant_access_token/internal"
	tokenRefreshBefore = 5 * time.Minute
)

// Client is a Feishu Open API client.
type Client struct {
	appID     string
	appSecret string
	http      *http.Client

	mu          sync.Mutex
	token       string
	tokenExpiry time.Time
}

// NewClient creates a new Feishu API client.
func NewClient(appID, appSecret string) *Client {
	return &Client{
		appID:     appID,
		appSecret: appSecret,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

// tenantAccessToken returns a valid tenant access token, refreshing if needed.
func (c *Client) tenantAccessToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExpiry) {
		return c.token, nil
	}

	body, _ := json.Marshal(map[string]string{
		"app_id":     c.appID,
		"app_secret": c.appSecret,
	})

	resp, err := c.http.Post(baseURL+tokenPath, "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("feishu auth request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int    `json:"expire"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("feishu auth decode failed: %w", err)
	}
	if result.Code != 0 {
		return "", fmt.Errorf("feishu auth error: code=%d msg=%s", result.Code, result.Msg)
	}

	c.token = result.TenantAccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(result.Expire)*time.Second - tokenRefreshBefore)
	return c.token, nil
}

// doJSON performs an authenticated JSON API call.
func (c *Client) doJSON(method, path string, reqBody interface{}) (json.RawMessage, error) {
	token, err := c.tenantAccessToken()
	if err != nil {
		return nil, err
	}

	var bodyReader io.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("feishu api request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	var envelope struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return nil, fmt.Errorf("decode response: %w (body: %s)", err, string(respBody))
	}
	if envelope.Code != 0 {
		return nil, fmt.Errorf("feishu api error: code=%d msg=%s", envelope.Code, envelope.Msg)
	}

	return envelope.Data, nil
}
