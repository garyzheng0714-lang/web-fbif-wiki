package knowledge

import (
	"strings"

	"github.com/garyzheng0714-lang/web-fbif-wiki/internal/feishu"
)

// ChangeType describes whether a QA pair is new or modified.
type ChangeType string

const (
	ChangeNew    ChangeType = "新增"
	ChangeUpdate ChangeType = "修改"
)

// Change represents a detected change between current and new Q&A.
type Change struct {
	QA          QAPair
	Type        ChangeType
	Description string
	RelatedID   string // record_id of the existing record (for updates)
}

// DiffQA compares new Q&A pairs against existing knowledge records
// and returns a list of changes (new or modified).
func DiffQA(newPairs []QAPair, existingRecords []feishu.Record) []Change {
	// Build index of existing questions → record
	existing := make(map[string]existingEntry)
	for _, rec := range existingRecords {
		question := fieldString(rec.Fields, "问题/主题")
		if question == "" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(question))
		existing[key] = existingEntry{
			recordID: rec.RecordID,
			answer:   fieldString(rec.Fields, "详细内容"),
			question: question,
		}
	}

	var changes []Change
	for _, pair := range newPairs {
		key := strings.ToLower(strings.TrimSpace(pair.Question))

		if entry, found := existing[key]; found {
			// Check if detail answer changed
			oldAnswer := strings.TrimSpace(entry.answer)
			newAnswer := strings.TrimSpace(pair.DetailAnswer)
			if oldAnswer != newAnswer {
				changes = append(changes, Change{
					QA:          pair,
					Type:        ChangeUpdate,
					Description: "答案内容已更新",
					RelatedID:   entry.recordID,
				})
			}
			// If same, skip
		} else {
			// New question
			changes = append(changes, Change{
				QA:          pair,
				Type:        ChangeNew,
				Description: "新增知识条目",
				RelatedID:   "",
			})
		}
	}

	return changes
}

type existingEntry struct {
	recordID string
	answer   string
	question string
}

func fieldString(fields map[string]interface{}, key string) string {
	v, ok := fields[key]
	if !ok {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case []interface{}:
		// Feishu text fields can be arrays of segments
		var parts []string
		for _, seg := range val {
			if m, ok := seg.(map[string]interface{}); ok {
				if text, ok := m["text"].(string); ok {
					parts = append(parts, text)
				}
			} else if s, ok := seg.(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "")
	default:
		return ""
	}
}
