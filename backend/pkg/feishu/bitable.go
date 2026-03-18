package feishu

import (
	"encoding/json"
	"fmt"
	"net/url"
)

// Record represents a Bitable record.
type Record struct {
	RecordID string                 `json:"record_id"`
	Fields   map[string]interface{} `json:"fields"`
}

// ListRecordsResponse is the response from listing records.
type ListRecordsResponse struct {
	HasMore   bool      `json:"has_more"`
	PageToken string    `json:"page_token"`
	Total     int       `json:"total"`
	Items     []Record  `json:"items"`
}

// ListRecords lists records from a Bitable table with optional filter.
func (c *Client) ListRecords(tableID string, pageSize int, pageToken string, filter string) (*ListRecordsResponse, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records?page_size=%d", c.appToken, tableID, pageSize)
	if pageToken != "" {
		path += "&page_token=" + pageToken
	}
	if filter != "" {
		path += "&filter=" + url.QueryEscape(filter)
	}

	data, err := c.api("GET", path, nil)
	if err != nil {
		return nil, err
	}
	var resp ListRecordsResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal records: %w", err)
	}
	return &resp, nil
}

// GetRecord gets a single record by ID.
func (c *Client) GetRecord(tableID, recordID string) (*Record, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records/%s", c.appToken, tableID, recordID)
	data, err := c.api("GET", path, nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Record Record `json:"record"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal record: %w", err)
	}
	return &resp.Record, nil
}

// CreateRecord creates a new record in a Bitable table.
func (c *Client) CreateRecord(tableID string, fields map[string]interface{}) (*Record, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records", c.appToken, tableID)
	body := map[string]interface{}{"fields": fields}
	data, err := c.api("POST", path, body)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Record Record `json:"record"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal record: %w", err)
	}
	return &resp.Record, nil
}

// UpdateRecord updates a record's fields.
func (c *Client) UpdateRecord(tableID, recordID string, fields map[string]interface{}) (*Record, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records/%s", c.appToken, tableID, recordID)
	body := map[string]interface{}{"fields": fields}
	data, err := c.api("PUT", path, body)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Record Record `json:"record"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal record: %w", err)
	}
	return &resp.Record, nil
}

// ListTables lists all tables in the Bitable app.
func (c *Client) ListTables() ([]map[string]interface{}, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables", c.appToken)
	data, err := c.api("GET", path, nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal tables: %w", err)
	}
	return resp.Items, nil
}
