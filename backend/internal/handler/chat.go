package handler

import (
	"bufio"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/garyzheng0714/fbif-kb/pkg/volcengine"
)

type ChatHandler struct {
	volc *volcengine.Client
}

func NewChatHandler(volc *volcengine.Client) *ChatHandler {
	return &ChatHandler{volc: volc}
}

type ChatReq struct {
	Query    string              `json:"query" binding:"required"`
	Stream   bool                `json:"stream"`
	Messages []volcengine.Message `json:"messages"`
}

// Chat handles POST /api/chat
func (h *ChatHandler) Chat(c *gin.Context) {
	var req ChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build messages: append the current query
	messages := req.Messages
	messages = append(messages, volcengine.Message{Role: "user", Content: req.Query})

	if req.Stream {
		h.chatStream(c, messages)
		return
	}

	resp, err := h.volc.Chat(messages)
	if err != nil {
		log.Printf("chat error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务暂时不可用"})
		return
	}

	// Extract image URLs from result_list chunk attachments
	if resp.Data != nil {
		images := make(map[string]string)
		for _, item := range resp.Data.ResultList {
			for _, att := range item.ChunkAttachment {
				if att.Link != "" && (att.Type == "image" || att.Type == "doc_image") {
					images[item.PointID] = att.Link
				}
			}
		}
		if len(images) > 0 {
			resp.Data.Images = images
		}
	}

	c.JSON(http.StatusOK, resp)
}

func (h *ChatHandler) chatStream(c *gin.Context, messages []volcengine.Message) {
	body, err := h.volc.ChatStream(messages)
	if err != nil {
		log.Printf("chat stream error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务暂时不可用"})
		return
	}
	defer body.Close()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	scanner := bufio.NewScanner(body)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 512*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		_, _ = io.WriteString(c.Writer, line+"\n\n")
		flusher.Flush()
	}
}
