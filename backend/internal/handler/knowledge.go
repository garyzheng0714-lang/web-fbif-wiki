package handler

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/garyzheng0714/fbif-kb/pkg/feishu"
)

type KnowledgeHandler struct {
	fs             *feishu.Client
	tableKnowledge string
	tableYearbook  string
	tableSpeakers  string
	tableCompanies string
}

func NewKnowledgeHandler(fs *feishu.Client, tableKnowledge, tableYearbook, tableSpeakers, tableCompanies string) *KnowledgeHandler {
	return &KnowledgeHandler{
		fs:             fs,
		tableKnowledge: tableKnowledge,
		tableYearbook:  tableYearbook,
		tableSpeakers:  tableSpeakers,
		tableCompanies: tableCompanies,
	}
}

// ListKnowledge handles GET /api/knowledge
func (h *KnowledgeHandler) ListKnowledge(c *gin.Context) {
	h.listRecords(c, h.tableKnowledge)
}

// CreateKnowledge handles POST /api/knowledge
func (h *KnowledgeHandler) CreateKnowledge(c *gin.Context) {
	var req struct {
		Fields map[string]interface{} `json:"fields" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set defaults
	if req.Fields["状态"] == nil {
		req.Fields["状态"] = "草稿"
	}
	if req.Fields["最后更新"] == nil {
		req.Fields["最后更新"] = time.Now().UnixMilli()
	}

	record, err := h.fs.CreateRecord(h.tableKnowledge, req.Fields)
	if err != nil {
		log.Printf("knowledge error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusCreated, record)
}

// UpdateKnowledge handles PATCH /api/knowledge/:id
func (h *KnowledgeHandler) UpdateKnowledge(c *gin.Context) {
	recordID := c.Param("id")
	var req struct {
		Fields map[string]interface{} `json:"fields" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Fields["最后更新"] = time.Now().UnixMilli()

	record, err := h.fs.UpdateRecord(h.tableKnowledge, recordID, req.Fields)
	if err != nil {
		log.Printf("knowledge error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, record)
}

// ArchiveKnowledge handles POST /api/knowledge/:id/archive
func (h *KnowledgeHandler) ArchiveKnowledge(c *gin.Context) {
	recordID := c.Param("id")
	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)

	fields := map[string]interface{}{
		"状态":   "已归档",
		"归档原因": req.Reason,
		"归档时间": time.Now().UnixMilli(),
		"最后更新": time.Now().UnixMilli(),
	}

	record, err := h.fs.UpdateRecord(h.tableKnowledge, recordID, fields)
	if err != nil {
		log.Printf("knowledge error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, record)
}

// PublishKnowledge handles POST /api/knowledge/:id/publish
func (h *KnowledgeHandler) PublishKnowledge(c *gin.Context) {
	recordID := c.Param("id")
	fields := map[string]interface{}{
		"状态":   "已发布",
		"最后更新": time.Now().UnixMilli(),
	}
	record, err := h.fs.UpdateRecord(h.tableKnowledge, recordID, fields)
	if err != nil {
		log.Printf("knowledge error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, record)
}

// ListYearbook handles GET /api/yearbook
func (h *KnowledgeHandler) ListYearbook(c *gin.Context) {
	h.listRecords(c, h.tableYearbook)
}

// ListSpeakers handles GET /api/speakers
func (h *KnowledgeHandler) ListSpeakers(c *gin.Context) {
	h.listRecords(c, h.tableSpeakers)
}

// ListCompanies handles GET /api/companies
func (h *KnowledgeHandler) ListCompanies(c *gin.Context) {
	h.listRecords(c, h.tableCompanies)
}

// ListTables handles GET /api/tables
func (h *KnowledgeHandler) ListTables(c *gin.Context) {
	tables, err := h.fs.ListTables()
	if err != nil {
		log.Printf("knowledge error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

func (h *KnowledgeHandler) listRecords(c *gin.Context, tableID string) {
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "100"))
	if pageSize < 1 || pageSize > 500 {
		pageSize = 100
	}
	pageToken := c.Query("page_token")
	filter := c.Query("filter")

	resp, err := h.fs.ListRecords(tableID, pageSize, pageToken, filter)
	if err != nil {
		log.Printf("knowledge error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, resp)
}
