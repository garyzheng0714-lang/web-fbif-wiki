package config

import "os"

type Config struct {
	Port string

	// Volcengine Knowledge Base
	VolcServiceID  string
	VolcAPIKey     string
	VolcBaseURL    string

	// Feishu Bitable
	FeishuAppID     string
	FeishuAppSecret string
	BitableAppToken string

	// CORS
	AllowOrigins string
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "8080"),
		VolcServiceID:   getEnv("VOLC_SERVICE_ID", "kb-service-b989dd842fb8767a"),
		VolcAPIKey:      getEnv("VOLC_API_KEY", ""),
		VolcBaseURL:     getEnv("VOLC_BASE_URL", "https://api-knowledgebase.mlp.cn-beijing.volces.com"),
		FeishuAppID:     getEnv("FEISHU_APP_ID", ""),
		FeishuAppSecret: getEnv("FEISHU_APP_SECRET", ""),
		BitableAppToken: getEnv("BITABLE_APP_TOKEN", "J63zbS4YUaF78MsQEAdcSjOVnLg"),
		AllowOrigins:    getEnv("ALLOW_ORIGINS", "*"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
