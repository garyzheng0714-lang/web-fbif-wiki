package feishu

import (
	"encoding/json"
	"fmt"
	"net/url"
)

// Field describes a bitable table field for creation.
type Field struct {
	FieldName string      `json:"field_name"`
	Type      int         `json:"type"`
	Property  interface{} `json:"property,omitempty"`
}

// Record represents a bitable record.
type Record struct {
	RecordID string                 `json:"record_id,omitempty"`
	Fields   map[string]interface{} `json:"fields"`
}

// SelectOption is used for single-select field property.
type SelectOption struct {
	Name string `json:"name"`
}

// Field type constants (Feishu bitable field types).
const (
	FieldTypeText        = 1
	FieldTypeSelect      = 3  // single select
	FieldTypeMultiSelect = 4  // multi select
	FieldTypeDateTime    = 5
	FieldTypeURL         = 15
)

// TableInfo holds basic table metadata.
type TableInfo struct {
	TableID string `json:"table_id"`
	Name    string `json:"name"`
}

// ListTables lists all tables in the bitable app.
func (c *Client) ListTables(appToken string) ([]TableInfo, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables?page_size=100", appToken)
	data, err := c.doJSON("GET", path, nil)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}

	var result struct {
		HasMore bool        `json:"has_more"`
		Items   []TableInfo `json:"items"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse list tables: %w", err)
	}
	return result.Items, nil
}

// ListFields lists all fields in a table.
func (c *Client) ListFields(appToken, tableID string) ([]Field, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/fields?page_size=100", appToken, tableID)
	data, err := c.doJSON("GET", path, nil)
	if err != nil {
		return nil, fmt.Errorf("list fields: %w", err)
	}
	var result struct {
		Items []struct {
			FieldName string `json:"field_name"`
			Type      int    `json:"type"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse list fields: %w", err)
	}
	fields := make([]Field, len(result.Items))
	for i, item := range result.Items {
		fields[i] = Field{FieldName: item.FieldName, Type: item.Type}
	}
	return fields, nil
}

// CreateField adds a field to an existing table.
func (c *Client) CreateField(appToken, tableID string, field Field) error {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/fields", appToken, tableID)
	_, err := c.doJSON("POST", path, field)
	if err != nil {
		return fmt.Errorf("create field %q: %w", field.FieldName, err)
	}
	return nil
}

// EnsureFields makes sure a table has all the specified fields, adding missing ones.
func (c *Client) EnsureFields(appToken, tableID string, needed []Field) error {
	existing, err := c.ListFields(appToken, tableID)
	if err != nil {
		return err
	}
	existingNames := make(map[string]bool)
	for _, f := range existing {
		existingNames[f.FieldName] = true
	}
	for _, f := range needed {
		if !existingNames[f.FieldName] {
			if err := c.CreateField(appToken, tableID, f); err != nil {
				return err
			}
		}
	}
	return nil
}

// CreateTable creates a new table in the bitable app.
func (c *Client) CreateTable(appToken, name string, fields []Field) (string, error) {
	body := map[string]interface{}{
		"table": map[string]interface{}{
			"name":          name,
			"default_view_name": "默认视图",
			"fields":        fields,
		},
	}

	path := fmt.Sprintf("/bitable/v1/apps/%s/tables", appToken)
	data, err := c.doJSON("POST", path, body)
	if err != nil {
		return "", fmt.Errorf("create table %q: %w", name, err)
	}

	var result struct {
		TableID string `json:"table_id"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", fmt.Errorf("parse create table response: %w", err)
	}
	return result.TableID, nil
}

// ListRecords fetches all records from a table, handling pagination.
func (c *Client) ListRecords(appToken, tableID string, filter string) ([]Record, error) {
	var allRecords []Record
	pageToken := ""

	for {
		path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records?page_size=500", appToken, tableID)
		if pageToken != "" {
			path += "&page_token=" + pageToken
		}
		if filter != "" {
			path += "&filter=" + url.QueryEscape(filter)
		}

		data, err := c.doJSON("GET", path, nil)
		if err != nil {
			return nil, fmt.Errorf("list records: %w", err)
		}

		var page struct {
			HasMore   bool     `json:"has_more"`
			PageToken string   `json:"page_token"`
			Total     int      `json:"total"`
			Items     []Record `json:"items"`
		}
		if err := json.Unmarshal(data, &page); err != nil {
			return nil, fmt.Errorf("parse list records response: %w", err)
		}

		allRecords = append(allRecords, page.Items...)

		if !page.HasMore {
			break
		}
		pageToken = page.PageToken
	}

	return allRecords, nil
}

// CreateRecord creates a single record in the table.
func (c *Client) CreateRecord(appToken, tableID string, fields map[string]interface{}) (string, error) {
	body := map[string]interface{}{
		"fields": fields,
	}

	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records", appToken, tableID)
	data, err := c.doJSON("POST", path, body)
	if err != nil {
		return "", fmt.Errorf("create record: %w", err)
	}

	var result struct {
		Record Record `json:"record"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", fmt.Errorf("parse create record response: %w", err)
	}
	return result.Record.RecordID, nil
}

// BatchCreateRecords creates multiple records in one call (max 500).
func (c *Client) BatchCreateRecords(appToken, tableID string, records []map[string]interface{}) ([]string, error) {
	wrappedRecords := make([]map[string]interface{}, len(records))
	for i, fields := range records {
		wrappedRecords[i] = map[string]interface{}{"fields": fields}
	}

	body := map[string]interface{}{
		"records": wrappedRecords,
	}

	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records/batch_create", appToken, tableID)
	data, err := c.doJSON("POST", path, body)
	if err != nil {
		return nil, fmt.Errorf("batch create records: %w", err)
	}

	var result struct {
		Records []Record `json:"records"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse batch create response: %w", err)
	}

	ids := make([]string, len(result.Records))
	for i, r := range result.Records {
		ids[i] = r.RecordID
	}
	return ids, nil
}

// UpdateRecord updates a single record.
func (c *Client) UpdateRecord(appToken, tableID, recordID string, fields map[string]interface{}) error {
	body := map[string]interface{}{
		"fields": fields,
	}

	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records/%s", appToken, tableID, recordID)
	_, err := c.doJSON("PUT", path, body)
	if err != nil {
		return fmt.Errorf("update record %s: %w", recordID, err)
	}
	return nil
}

// KnowledgeTableFields returns the field definitions for the knowledge items table.
func KnowledgeTableFields() []Field {
	return []Field{
		{FieldName: "问题", Type: FieldTypeText},
		{FieldName: "答案", Type: FieldTypeText},
		{FieldName: "分类", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "论坛"}, {Name: "展览"}, {Name: "奖项"}, {Name: "票务"},
				{Name: "嘉宾"}, {Name: "联系方式"}, {Name: "渠道活动"}, {Name: "其他"},
			},
		}},
		{FieldName: "信源URL", Type: FieldTypeURL},
		{FieldName: "适用年份", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "FBIF2026"}, {Name: "FBIF2025"}, {Name: "通用"},
			},
		}},
		{FieldName: "关键词", Type: FieldTypeText},
		{FieldName: "最后更新时间", Type: FieldTypeDateTime, Property: map[string]interface{}{
			"date_formatter": "yyyy/MM/dd HH:mm",
		}},
	}
}

// PendingTableFields returns field definitions for the pending review table.
// Matches knowledge table fields + review-specific fields.
func PendingTableFields() []Field {
	return []Field{
		// Knowledge table fields (for easy sync)
		{FieldName: "知识ID", Type: FieldTypeText},
		{FieldName: "问题/主题", Type: FieldTypeText},
		{FieldName: "简短回答", Type: FieldTypeText},
		{FieldName: "详细内容", Type: FieldTypeText},
		{FieldName: "分类", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "展会概况"}, {Name: "论坛日程"}, {Name: "展览信息"}, {Name: "票务信息"},
				{Name: "嘉宾阵容"}, {Name: "奖项活动"}, {Name: "联系方式"}, {Name: "渠道活动"}, {Name: "其他"},
			},
		}},
		{FieldName: "适用年份", Type: FieldTypeMultiSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "FBIF2026"}, {Name: "FBIF2025"}, {Name: "通用"},
			},
		}},
		{FieldName: "标签", Type: FieldTypeMultiSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "核心信息"}, {Name: "FAQ"}, {Name: "新手必读"},
				{Name: "展商"}, {Name: "参展"}, {Name: "购票"}, {Name: "报名"},
				{Name: "嘉宾"}, {Name: "议程"}, {Name: "奖项"},
			},
		}},
		{FieldName: "优先级", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "高"}, {Name: "中"}, {Name: "低"},
			},
		}},
		{FieldName: "状态", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "待发布"}, {Name: "已发布"},
			},
		}},
		{FieldName: "最后更新", Type: FieldTypeDateTime, Property: map[string]interface{}{
			"date_formatter": "yyyy/MM/dd HH:mm",
		}},
		// Review-specific fields
		{FieldName: "变更类型", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "新增"}, {Name: "修改"},
			},
		}},
		{FieldName: "变更说明", Type: FieldTypeText},
		{FieldName: "关联知识ID", Type: FieldTypeText},
		{FieldName: "审核状态", Type: FieldTypeSelect, Property: map[string]interface{}{
			"options": []SelectOption{
				{Name: "待审核"}, {Name: "加入总知识库"}, {Name: "不采纳"}, {Name: "已加入总知识库"},
			},
		}},
	}
}
