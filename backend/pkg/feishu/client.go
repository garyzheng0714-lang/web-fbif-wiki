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

const baseURL = "https://open.feishu.cn/open-apis"

type Client struct {
	appID     string
	appSecret string
	appToken  string // Bitable app token

	mu          sync.RWMutex
	token       string
	tokenExpiry time.Time
	http        *http.Client
}

func NewClient(appID, appSecret, appToken string) *Client {
	return &Client{
		appID:     appID,
		appSecret: appSecret,
		appToken:  appToken,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

// ensureToken refreshes the tenant access token if expired.
func (c *Client) ensureToken() error {
	c.mu.RLock()
	if c.token != "" && time.Now().Before(c.tokenExpiry) {
		c.mu.RUnlock()
		return nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	// Double check after acquiring write lock
	if c.token != "" && time.Now().Before(c.tokenExpiry) {
		return nil
	}

	body, _ := json.Marshal(map[string]string{
		"app_id":     c.appID,
		"app_secret": c.appSecret,
	})
	resp, err := c.http.Post(baseURL+"/auth/v3/tenant_access_token/internal", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("get token: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int    `json:"expire"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode token response: %w", err)
	}
	if result.Code != 0 {
		return fmt.Errorf("token error: %s", result.Msg)
	}
	c.token = result.TenantAccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(result.Expire-60) * time.Second) // 60s buffer
	return nil
}

// api makes an authenticated API call.
func (c *Client) api(method, path string, reqBody interface{}) (json.RawMessage, error) {
	if err := c.ensureToken(); err != nil {
		return nil, err
	}

	var bodyReader io.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	c.mu.RLock()
	req.Header.Set("Authorization", "Bearer "+c.token)
	c.mu.RUnlock()
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var apiResp struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return nil, fmt.Errorf("unmarshal (raw: %s): %w", string(respBytes), err)
	}
	if apiResp.Code != 0 {
		return nil, fmt.Errorf("API error code=%d: %s", apiResp.Code, apiResp.Msg)
	}
	return apiResp.Data, nil
}
