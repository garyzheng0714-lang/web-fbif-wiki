package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"github.com/garyzheng0714/fbif-kb/internal/config"
	"github.com/garyzheng0714/fbif-kb/internal/handler"
	"github.com/garyzheng0714/fbif-kb/internal/middleware"
	"github.com/garyzheng0714/fbif-kb/pkg/feishu"
	"github.com/garyzheng0714/fbif-kb/pkg/volcengine"
)

//go:embed all:web
var webFS embed.FS

func main() {
	_ = godotenv.Load() // Load .env if present
	cfg := config.Load()

	// Validate required config
	if cfg.VolcAPIKey == "" {
		log.Fatal("VOLC_API_KEY is required")
	}
	if cfg.FeishuAppID == "" || cfg.FeishuAppSecret == "" {
		log.Fatal("FEISHU_APP_ID and FEISHU_APP_SECRET are required")
	}

	// Initialize clients
	volcClient := volcengine.NewClient(cfg.VolcBaseURL, cfg.VolcAPIKey, cfg.VolcServiceID)
	feishuClient := feishu.NewClient(cfg.FeishuAppID, cfg.FeishuAppSecret, cfg.BitableAppToken)

	// Initialize handlers
	chatH := handler.NewChatHandler(volcClient)
	kbH := handler.NewKnowledgeHandler(feishuClient)

	// Setup router
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.Use(middleware.CORS(cfg.AllowOrigins))

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "fbif-kb",
		})
	})

	// API routes
	api := r.Group("/api")
	{
		api.POST("/chat", chatH.Chat)

		api.GET("/knowledge", kbH.ListKnowledge)
		api.POST("/knowledge", kbH.CreateKnowledge)
		api.PATCH("/knowledge/:id", kbH.UpdateKnowledge)
		api.POST("/knowledge/:id/archive", kbH.ArchiveKnowledge)
		api.POST("/knowledge/:id/publish", kbH.PublishKnowledge)

		api.GET("/yearbook", kbH.ListYearbook)
		api.GET("/speakers", kbH.ListSpeakers)
		api.GET("/companies", kbH.ListCompanies)
		api.GET("/tables", kbH.ListTables)
	}

	// Serve embedded frontend
	webSub, _ := fs.Sub(webFS, "web")
	r.NoRoute(gin.WrapH(http.FileServer(http.FS(webSub))))

	log.Printf("🚀 FBIF Knowledge Base starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
