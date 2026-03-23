package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/garyzheng0714-lang/web-fbif-wiki/internal/knowledge"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	cfg := loadConfig()
	cmd := strings.ToLower(os.Args[1])

	switch cmd {
	case "init":
		if err := knowledge.InitTables(cfg); err != nil {
			log.Fatalf("init failed: %v", err)
		}
	case "scrape":
		if err := knowledge.RunScrape(cfg); err != nil {
			log.Fatalf("scrape failed: %v", err)
		}
	case "review":
		if err := knowledge.RunReview(cfg); err != nil {
			log.Fatalf("review failed: %v", err)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `Usage: knowledge-sync <command>

Commands:
  init     Create Feishu bitable tables (run once)
  scrape   Scrape sources and write Q&A to pending review
  review   Sync approved pending records to knowledge base`)
}

func loadConfig() knowledge.Config {
	loadDotEnv()

	sourcesFile := os.Getenv("SOURCES_FILE")
	if sourcesFile == "" {
		sourcesFile = "config/sources.json"
	}
	// Resolve relative to working directory
	if !filepath.IsAbs(sourcesFile) {
		if wd, err := os.Getwd(); err == nil {
			sourcesFile = filepath.Join(wd, sourcesFile)
		}
	}

	pendingAppToken := os.Getenv("FEISHU_PENDING_APP_TOKEN")
	if pendingAppToken == "" {
		pendingAppToken = os.Getenv("FEISHU_APP_TOKEN") // fallback to same app
	}

	return knowledge.Config{
		FeishuAppID:     os.Getenv("FEISHU_APP_ID"),
		FeishuAppSecret: os.Getenv("FEISHU_APP_SECRET"),
		FeishuAppToken:  os.Getenv("FEISHU_APP_TOKEN"),
		TableKnowledge:  os.Getenv("FEISHU_TABLE_KNOWLEDGE"),
		PendingAppToken: pendingAppToken,
		TablePending:    os.Getenv("FEISHU_TABLE_PENDING"),
		SourcesFile:     sourcesFile,
	}
}

// loadDotEnv loads .env file from the current directory or parent directories.
func loadDotEnv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}

	// Search up from cwd for .env
	for {
		envPath := filepath.Join(dir, ".env")
		data, err := os.ReadFile(envPath)
		if err == nil {
			parseEnvFile(string(data))
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
}

func parseEnvFile(content string) {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		// Don't override existing env vars
		if os.Getenv(key) == "" {
			os.Setenv(key, value)
		}
	}
}
