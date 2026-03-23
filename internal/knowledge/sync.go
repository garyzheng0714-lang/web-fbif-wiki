package knowledge

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/garyzheng0714-lang/web-fbif-wiki/internal/feishu"
	"github.com/garyzheng0714-lang/web-fbif-wiki/internal/scraper"
)

// Config holds the configuration for knowledge sync.
type Config struct {
	FeishuAppID        string
	FeishuAppSecret    string
	FeishuAppToken     string // app token for knowledge table
	TableKnowledge     string
	PendingAppToken    string // app token for pending table (may differ)
	TablePending       string
	SourcesFile        string
}

// Source represents a news source to scrape.
type Source struct {
	URL      string `json:"url"`
	Category string `json:"category"`
	Title    string `json:"title"`
}

// SourcesConfig holds the list of sources.
type SourcesConfig struct {
	Sources []Source `json:"sources"`
}

// LoadSources reads the sources config file.
func LoadSources(path string) ([]Source, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read sources file: %w", err)
	}
	var cfg SourcesConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse sources file: %w", err)
	}
	return cfg.Sources, nil
}

// InitTables creates the knowledge and pending tables in Feishu.
// If tables already exist, it prints their IDs instead.
func InitTables(cfg Config) error {
	client := feishu.NewClient(cfg.FeishuAppID, cfg.FeishuAppSecret)

	// List existing tables first
	tables, err := client.ListTables(cfg.FeishuAppToken)
	if err != nil {
		return fmt.Errorf("list existing tables: %w", err)
	}

	existing := make(map[string]string) // name → tableID
	for _, t := range tables {
		existing[t.Name] = t.TableID
		log.Printf("found existing table: %s (%s)", t.Name, t.TableID)
	}

	knowledgeID := existing["知识条目"]
	pendingID := existing["待审核"]

	if knowledgeID == "" {
		log.Println("creating knowledge items table...")
		id, err := client.CreateTable(cfg.FeishuAppToken, "知识条目", feishu.KnowledgeTableFields())
		if err != nil {
			return fmt.Errorf("create knowledge table: %w", err)
		}
		knowledgeID = id
		log.Printf("knowledge table created: %s", knowledgeID)
	} else {
		log.Printf("knowledge table already exists: %s", knowledgeID)
	}

	if pendingID == "" {
		log.Println("creating pending review table...")
		id, err := client.CreateTable(cfg.FeishuAppToken, "待审核", feishu.PendingTableFields())
		if err != nil {
			return fmt.Errorf("create pending table: %w", err)
		}
		pendingID = id
		log.Printf("pending table created: %s", pendingID)
	} else {
		log.Printf("pending table already exists: %s", pendingID)
	}

	fmt.Println("\n=== 请将以下内容添加到 .env 文件 ===")
	fmt.Printf("FEISHU_TABLE_KNOWLEDGE=%s\n", knowledgeID)
	fmt.Printf("FEISHU_TABLE_PENDING=%s\n", pendingID)

	return nil
}

// RunScrape performs a full scrape cycle: fetch → generate Q&A → diff → write pending.
func RunScrape(cfg Config) error {
	if cfg.TableKnowledge == "" || cfg.TablePending == "" {
		return fmt.Errorf("FEISHU_TABLE_KNOWLEDGE and FEISHU_TABLE_PENDING must be set (run 'init' first)")
	}

	// Load sources
	sources, err := LoadSources(cfg.SourcesFile)
	if err != nil {
		return err
	}

	// Start headless browser
	log.Println("starting headless browser...")
	sc, err := scraper.New()
	if err != nil {
		return fmt.Errorf("start scraper: %w", err)
	}
	defer sc.Close()

	// Scrape all sources with depth=1 (follow internal links one level deep)
	var allArticles []*scraper.Article
	for _, src := range sources {
		log.Printf("scraping: %s (%s)", src.Title, src.URL)
		articles, err := sc.ScrapeWithDepth(src.URL, 1)
		if err != nil {
			log.Printf("warning: failed to scrape %s: %v", src.URL, err)
			continue
		}
		allArticles = append(allArticles, articles...)
	}

	if len(allArticles) == 0 {
		log.Println("no articles scraped, nothing to do")
		return nil
	}

	log.Printf("scraped %d articles total", len(allArticles))

	// Generate Q&A pairs
	pairs := GenerateQA(allArticles)
	log.Printf("generated %d Q&A pairs", len(pairs))

	if len(pairs) == 0 {
		log.Println("no Q&A pairs generated")
		return nil
	}

	// Fetch existing knowledge records
	client := feishu.NewClient(cfg.FeishuAppID, cfg.FeishuAppSecret)
	existingRecords, err := client.ListRecords(cfg.FeishuAppToken, cfg.TableKnowledge, "")
	if err != nil {
		log.Printf("warning: failed to list existing records: %v (treating as empty)", err)
		existingRecords = nil
	}

	// Diff
	changes := DiffQA(pairs, existingRecords)
	log.Printf("detected %d changes (%d new, %d updates)",
		len(changes), countType(changes, ChangeNew), countType(changes, ChangeUpdate))

	if len(changes) == 0 {
		log.Println("no changes detected")
		return nil
	}

	// Ensure pending table has all required fields
	if err := client.EnsureFields(cfg.PendingAppToken, cfg.TablePending, feishu.PendingTableFields()); err != nil {
		log.Printf("warning: ensure fields: %v", err)
	}

	// Write changes to pending table in batches
	const batchSize = 100
	for i := 0; i < len(changes); i += batchSize {
		end := i + batchSize
		if end > len(changes) {
			end = len(changes)
		}
		batch := changes[i:end]

		records := make([]map[string]interface{}, len(batch))
		for j, change := range batch {
			records[j] = change.QA.ToPendingFields(
				string(change.Type),
				change.Description,
				change.RelatedID,
			)
		}

		ids, err := client.BatchCreateRecords(cfg.PendingAppToken, cfg.TablePending, records)
		if err != nil {
			return fmt.Errorf("batch create pending records: %w", err)
		}
		log.Printf("wrote %d pending records (batch %d)", len(ids), i/batchSize+1)
	}

	log.Printf("scrape complete at %s", time.Now().Format("2006-01-02 15:04:05"))
	return nil
}

// RunReview checks the pending table for approved records and syncs them.
func RunReview(cfg Config) error {
	if cfg.TableKnowledge == "" || cfg.TablePending == "" {
		return fmt.Errorf("FEISHU_TABLE_KNOWLEDGE and FEISHU_TABLE_PENDING must be set")
	}

	client := feishu.NewClient(cfg.FeishuAppID, cfg.FeishuAppSecret)

	// Fetch pending records where status = "加入总知识库"
	filter := `CurrentValue.[审核状态]="加入总知识库"`
	pendingRecords, err := client.ListRecords(cfg.PendingAppToken, cfg.TablePending, filter)
	if err != nil {
		return fmt.Errorf("list pending records: %w", err)
	}

	if len(pendingRecords) == 0 {
		log.Println("no approved records to sync")
		return nil
	}

	log.Printf("found %d approved records to sync", len(pendingRecords))

	for _, rec := range pendingRecords {
		question := fieldString(rec.Fields, "问题/主题")
		changeType := fieldString(rec.Fields, "变更类型")
		relatedID := fieldString(rec.Fields, "关联知识ID")

		// Build knowledge record fields — matching knowledge table structure
		knowledgeFields := map[string]interface{}{
			"知识ID":   fieldString(rec.Fields, "知识ID"),
			"问题/主题":  question,
			"简短回答":   fieldString(rec.Fields, "简短回答"),
			"详细内容":   fieldString(rec.Fields, "详细内容"),
			"分类":     fieldString(rec.Fields, "分类"),
			"优先级":    fieldString(rec.Fields, "优先级"),
			"状态":     "已发布",
			"最后更新":   time.Now().UnixMilli(),
		}
		// Copy array fields (适用年份, 标签)
		if v, ok := rec.Fields["适用年份"]; ok {
			knowledgeFields["适用年份"] = v
		}
		if v, ok := rec.Fields["标签"]; ok {
			knowledgeFields["标签"] = v
		}

		switch strings.TrimSpace(changeType) {
		case "新增":
			recordID, err := client.CreateRecord(cfg.FeishuAppToken, cfg.TableKnowledge, knowledgeFields)
			if err != nil {
				log.Printf("error creating knowledge record for %q: %v", question, err)
				continue
			}
			log.Printf("created knowledge record: %s (%s)", question, recordID)

		case "修改":
			if relatedID == "" {
				log.Printf("warning: update record %q has no related ID, creating as new", question)
				_, err := client.CreateRecord(cfg.FeishuAppToken, cfg.TableKnowledge, knowledgeFields)
				if err != nil {
					log.Printf("error creating knowledge record for %q: %v", question, err)
				}
			} else {
				err := client.UpdateRecord(cfg.FeishuAppToken, cfg.TableKnowledge, relatedID, knowledgeFields)
				if err != nil {
					log.Printf("error updating knowledge record %s: %v", relatedID, err)
					continue
				}
				log.Printf("updated knowledge record: %s (%s)", question, relatedID)
			}
		}

		// Update pending record status to "已加入总知识库"
		err := client.UpdateRecord(cfg.PendingAppToken, cfg.TablePending, rec.RecordID, map[string]interface{}{
			"审核状态": "已加入总知识库",
		})
		if err != nil {
			log.Printf("error updating pending status for %s: %v", rec.RecordID, err)
		}
	}

	log.Printf("review sync complete at %s", time.Now().Format("2006-01-02 15:04:05"))
	return nil
}

func countType(changes []Change, t ChangeType) int {
	count := 0
	for _, c := range changes {
		if c.Type == t {
			count++
		}
	}
	return count
}
