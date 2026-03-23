package knowledge

import (
	"crypto/sha256"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/garyzheng0714-lang/web-fbif-wiki/internal/scraper"
)

// QAPair represents a question-answer pair matching the knowledge table structure.
type QAPair struct {
	KnowledgeID  string   // 知识ID, e.g. KB-NEW-001
	Question     string   // 问题/主题
	ShortAnswer  string   // 简短回答
	DetailAnswer string   // 详细内容
	Category     string   // 分类 (single select)
	Year         string   // 适用年份 (single select)
	Tags         []string // 标签 (kept as slice for internal use)
	Priority     string   // 优先级
	SourceURL    string   // for tracking
	Hash         string   // content hash for change detection
}

// GenerateQA extracts Q&A pairs from scraped articles.
func GenerateQA(articles []*scraper.Article) []QAPair {
	var pairs []QAPair

	for _, article := range articles {
		extracted := extractQAFromArticle(article)
		pairs = append(pairs, extracted...)
	}

	// Deduplicate by question
	seen := make(map[string]bool)
	var unique []QAPair
	for _, p := range pairs {
		key := strings.ToLower(p.Question)
		if !seen[key] {
			seen[key] = true
			unique = append(unique, p)
		}
	}

	return unique
}

func extractQAFromArticle(article *scraper.Article) []QAPair {
	var pairs []QAPair
	content := article.Content
	url := article.URL

	// Detect article type and generate appropriate Q&A
	if isExhibitorList(content) {
		pairs = append(pairs, generateExhibitorQA(content, url)...)
	}
	if isNavigationGuide(content) {
		pairs = append(pairs, generateNavigationQA(content, url)...)
	}
	if containsTicketInfo(content) {
		pairs = append(pairs, generateTicketQA(content, url)...)
	}
	if containsContactInfo(content) {
		pairs = append(pairs, generateContactQA(content, url)...)
	}

	// Always try to extract general info
	pairs = append(pairs, generateGeneralQA(content, url)...)

	// Hashes are computed in newQA()

	return pairs
}

func isExhibitorList(content string) bool {
	return strings.Contains(content, "展商名录") || strings.Contains(content, "展商")
}

func isNavigationGuide(content string) bool {
	return strings.Contains(content, "导航") || strings.Contains(content, "资料汇总")
}

func containsTicketInfo(content string) bool {
	return strings.Contains(content, "门票") || strings.Contains(content, "购票") || strings.Contains(content, "参会报名")
}

func containsContactInfo(content string) bool {
	return strings.Contains(content, "联系我们") || strings.Contains(content, "联系方式")
}

func generateExhibitorQA(content, sourceURL string) []QAPair {
	var pairs []QAPair

	pairs = append(pairs, newQA("FBIF2026有多少家展商？",
		"FBIF2026预计将有650+家展商参展。",
		"FBIF2026预计将有 **650+** 家展商参展，涵盖乳品、饮料、零食、酒、方便食品、功能性食品、调味品等品牌方，以及配料、代工、包装、设备、设计、营销等企业。\n\n👉 [查看展商名录](https://www.foodtalks.cn/news/56962)",
		"展览", sourceURL, []string{"FBIF2026"}, []string{"展商", "参展", "规模"}, "高"))

	brandSection := extractSection(content, "品牌方", "供应商")
	if brandSection != "" {
		companies := extractCompanyList(brandSection)
		if len(companies) > 0 {
			detail := fmt.Sprintf("FBIF2026参展的品牌方包括（部分展商）：\n\n%s\n\n完整名录请查看 👉 [FBIF2026展商名录](https://www.foodtalks.cn/news/56962)", formatCompanyList(companies, 20))
			pairs = append(pairs, newQA("FBIF2026有哪些品牌方参展？",
				"FBIF2026参展品牌方涵盖乳品、饮料、零食、酒等多个品类。",
				detail, "展览", sourceURL, []string{"FBIF2026"}, []string{"品牌方", "展商", "参展企业"}, "中"))
		}
	}

	supplierCategories := []struct {
		name, question, short string
		tags                  []string
	}{
		{"原配料", "FBIF2026有哪些原配料供应商参展？", "FBIF2026参展的原配料供应商涵盖香精香料、功能性配料等领域。", []string{"原配料", "供应商"}},
		{"包装及设备", "FBIF2026有哪些包装及设备企业参展？", "FBIF2026参展的包装及设备企业涵盖包材、印刷、机械等领域。", []string{"包装", "设备"}},
		{"代工", "FBIF2026有哪些代工企业参展？", "FBIF2026参展的代工企业涵盖保健品、饮料、烘焙等品类的OEM/ODM。", []string{"代工", "OEM"}},
		{"营销、设计", "FBIF2026有哪些营销设计企业参展？", "FBIF2026参展的营销设计企业涵盖品牌咨询、包装设计、市场调研等服务。", []string{"营销", "设计"}},
	}
	for _, cat := range supplierCategories {
		section := extractSection(content, cat.name, "")
		if section != "" {
			companies := extractCompanyList(section)
			if len(companies) > 0 {
				detail := fmt.Sprintf("FBIF2026参展的%s企业包括（部分）：\n\n%s\n\n👉 [查看完整名录](https://www.foodtalks.cn/news/56962)", cat.name, formatCompanyList(companies, 15))
				pairs = append(pairs, newQA(cat.question, cat.short, detail,
					"展览", sourceURL, []string{"FBIF2026"}, cat.tags, "中"))
			}
		}
	}

	if strings.Contains(content, "53800") || strings.Contains(content, "展览面积") {
		pairs = append(pairs, newQA("FBIF2026展览面积有多大？",
			"FBIF2026食品创新展展览面积达53,800平方米。",
			"FBIF2026食品创新展展览面积达 **53,800平方米**，预计容纳 650+ 家展商，覆盖全球食品行业品牌和供应链创新企业，将吸引 47,000+ 观众观展。",
			"展览", sourceURL, []string{"FBIF2026"}, []string{"展览面积", "规模"}, "中"))
	}

	return pairs
}

func generateNavigationQA(content, sourceURL string) []QAPair {
	var pairs []QAPair

	if strings.Contains(content, "议程") {
		pairs = append(pairs, newQA("FBIF2026的论坛议程在哪里查看？",
			"可通过FBIF官网查看论坛议程。",
			"您可以通过以下链接查看 FBIF2026 的论坛议程：\n\n👉 [FBIF2026议程](https://www.foodtalks.cn/fbif/2026/forum/agenda)\n\n论坛将于 2026年4月27-29日在杭州国际博览中心3楼举办。",
			"论坛", sourceURL, []string{"FBIF2026"}, []string{"议程", "日程"}, "高"))
	}

	if strings.Contains(content, "购票") || strings.Contains(content, "参会") {
		pairs = append(pairs, newQA("如何购票参加FBIF2026？",
			"可通过FBIF官网在线购票参会。",
			"您可以通过 FBIF 官网在线购票：\n\n👉 [立即购票](https://www.foodtalks.cn/fbif/2026/attend/buytickets)\n\n如有购票问题，可联系：\n- 曾经理（Carrie）手机：13166002590\n- 微信：lovelyFBIFer1\n- 邮箱：carrie@fbif.com",
			"票务", sourceURL, []string{"FBIF2026"}, []string{"购票", "报名", "参会"}, "高"))
	}

	if strings.Contains(content, "演讲嘉宾") {
		pairs = append(pairs, newQA("FBIF2026有哪些演讲嘉宾？",
			"FBIF2026演讲嘉宾涵盖全球食品饮料行业顶级企业高管，预计3500+位行业嘉宾参会。",
			"FBIF2026 演讲嘉宾阵容涵盖全球食品饮料行业领先企业的高管。\n\n👉 [查看完整嘉宾名录](https://www.foodtalks.cn/fbif/2026/speakers)\n\n预计将有 3,500+ 位行业嘉宾参会。",
			"嘉宾", sourceURL, []string{"FBIF2026"}, []string{"嘉宾", "演讲者"}, "高"))
	}

	if strings.Contains(content, "Wow食品创新奖") || strings.Contains(content, "Marking Awards") {
		pairs = append(pairs, newQA("FBIF有哪些奖项？如何参评？",
			"FBIF设有Wow食品创新奖和Marking Awards两大奖项。",
			"FBIF 设有两大奖项：\n\n1. **FBIF Wow食品创新奖** — 食品产品创新评鉴\n2. **Marking Awards** — 全球食品包装设计大赛\n\nFBIF Wow食品创新奖 2026 颁奖仪式将在论坛期间举办。\n\n如需参评，请访问官网了解详情。",
			"奖项", sourceURL, []string{"FBIF2026"}, []string{"奖项", "Wow", "Marking Awards"}, "中"))
	}

	if strings.Contains(content, "展区平面图") || strings.Contains(content, "展馆") {
		pairs = append(pairs, newQA("FBIF2026展区在哪里？有平面图吗？",
			"FBIF2026展览位于杭州国际博览中心1楼和3楼。",
			"FBIF2026食品创新展位于杭州国际博览中心 **1楼和3楼**。\n\n- 论坛在 **3楼**（4月27-29日）\n- 展览在 **1楼 & 3楼**（4月27-29日）\n\n展区平面图可在官网查看：\n👉 [展览信息](https://www.foodtalks.cn/fbif/2026/exhibition/fbifexpo)",
			"展览", sourceURL, []string{"FBIF2026"}, []string{"展区", "平面图", "展馆"}, "中"))
	}

	return pairs
}

func generateTicketQA(content, sourceURL string) []QAPair {
	var pairs []QAPair

	if strings.Contains(content, "门票转赠") {
		pairs = append(pairs, newQA("FBIF2026的门票可以转赠吗？",
			"可以，FBIF2026支持门票转赠功能。",
			"可以。FBIF2026 支持门票转赠功能，您可以将已购门票转赠给他人��具体���作请参考参会观展指南。\n\n👉 [参会观展指南](https://www.foodtalks.cn/fbif/2026/attend/buytickets)",
			"票务", sourceURL, []string{"FBIF2026"}, []string{"门票转赠"}, "中"))
	}

	return pairs
}

func generateContactQA(content, sourceURL string) []QAPair {
	var pairs []QAPair

	contacts := []string{}
	if strings.Contains(content, "carrie@fbif.com") || strings.Contains(content, "13166002590") {
		contacts = append(contacts, "**参会 & 参展咨询**\n- 曾经理（Carrie）\n- 手机：13166002590\n- 微信：lovelyFBIFer1\n- 邮箱：carrie@fbif.com")
	}
	if strings.Contains(content, "bella@fbif.com") {
		contacts = append(contacts, "**演讲及战略合作**\n- 贝拉（Isabella Hsu）\n- 手机：18217049505\n- 微信：xuyuanhui021909\n- 邮箱：bella@fbif.com")
	}
	if strings.Contains(content, "dudu@fbif.com") {
		contacts = append(contacts, "**媒体合作**\n- 王禧瑞（Dudu）\n- 手机：13162577613\n- 微信：FBIF_nana\n- 邮箱：dudu@fbif.com")
	}

	if len(contacts) > 0 {
		detail := "FBIF2026 联系方式：\n\n" + strings.Join(contacts, "\n\n")
		pairs = append(pairs, newQA("FBIF2026的联系方式是什么？",
			"FBIF提供参会参展、演讲合作、媒体合作等多种联系渠道。",
			detail, "联系方式", sourceURL, []string{"FBIF2026"}, []string{"联系方式", "电话", "邮箱"}, "高"))
	}

	return pairs
}

func generateGeneralQA(content, sourceURL string) []QAPair {
	var pairs []QAPair

	if strings.Contains(content, "2026年4月27") || strings.Contains(content, "杭州国际博览中心") {
		pairs = append(pairs, newQA("FBIF2026什么时候举办？在哪里？",
			"FBIF2026将于2026年4月27-29日在杭州国际博览中心举办。",
			"FBIF2026 食品饮料创新论坛将于 **2026年4月27-29日** 在 **杭州国际博览中心** 举办。\n\n预计将有 3,500+ 位行业嘉宾参会，650+ 展商参展，47,000+ 观众观展。\n\n👉 [了解更多](https://www.foodtalks.cn/fbif/2026/resources/aboutus)",
			"其他", sourceURL, []string{"FBIF2026"}, []string{"时间", "地点", "核心信息"}, "高"))
	}

	if strings.Contains(content, "食品饮料创新论坛") && strings.Contains(content, "亚太") {
		pairs = append(pairs, newQA("FBIF是什么？",
			"FBIF是食品饮料创新论坛，亚太地区最具行业影响力的食品盛会之一。",
			"FBIF（Food & Beverage Innovation Forum）食品饮料创新论坛是亚太地区颇具行业影响力的食品盛会之一。FBIF 始于2014年，由 Simba Events 创办，通过分享全球范围内成功的商业案例、创新理念与技术，帮助行业从业者洞察未来趋势，找寻创新方向。\n\n核心板块包括：论坛、展览（iFood Show）和奖项（Marking Awards、Wow Food Awards）。",
			"其他", sourceURL, []string{"通用"}, []string{"核心信息", "FAQ"}, "高"))
	}

	if strings.Contains(content, "乳品") && strings.Contains(content, "饮料") && strings.Contains(content, "零食") {
		pairs = append(pairs, newQA("FBIF2026论坛有哪些议题方向？",
			"FBIF2026论坛涵盖全体大会、乳品、饮料、零食烘焙、功能性食品、营销、包装等多个分会场。",
			"FBIF2026 论坛涵盖多个分会场：\n\n- **全体大会**\n- **乳品**研发创新\n- **饮料**研发创新\n- **零食与烘焙**研发创新\n- **功能性食品**研发创新\n- **营销创新**\n- **包装创新**\n- **产品开发论坛**\n- **首席选品官论坛**\n\n👉 [查看完整议程](https://www.foodtalks.cn/fbif/2026/forum/agenda)",
			"论坛", sourceURL, []string{"FBIF2026"}, []string{"论坛", "议题", "分会场"}, "高"))
	}

	if strings.Contains(content, "参展") && strings.Contains(content, "展位") {
		pairs = append(pairs, newQA("我想参展FBIF2026，怎么报名？",
			"可通过FBIF官网申请展位或联系招展团队。",
			"您可以通过以下方式申请参展 FBIF2026：\n\n1. 访问 FBIF 官网了解展位类型和价格\n2. 联系招展团队获取一对一服务\n\n**联系方式：**\n- 曾经理（Carrie）手机：13166002590\n- 微信：lovelyFBIFer1\n- 邮箱：carrie@fbif.com\n\n👉 [展览信息](https://www.foodtalks.cn/fbif/2026/exhibition/fbifexpo)",
			"展览", sourceURL, []string{"FBIF2026"}, []string{"参展", "展位", "报名"}, "高"))
	}

	return pairs
}

// Helper: extract a section of text between two headers
func extractSection(content, startMarker, endMarker string) string {
	startIdx := strings.Index(content, startMarker)
	if startIdx == -1 {
		return ""
	}
	startIdx += len(startMarker)

	if endMarker == "" {
		// Take next 2000 chars
		end := startIdx + 2000
		if end > len(content) {
			end = len(content)
		}
		return content[startIdx:end]
	}

	endIdx := strings.Index(content[startIdx:], endMarker)
	if endIdx == -1 {
		end := startIdx + 2000
		if end > len(content) {
			end = len(content)
		}
		return content[startIdx:end]
	}

	return content[startIdx : startIdx+endIdx]
}

// Helper: extract company names from content
func extractCompanyList(section string) []string {
	lines := strings.Split(section, "\n")
	var companies []string
	seen := make(map[string]bool)

	// Pattern: company name followed by hall + booth number
	boothPattern := regexp.MustCompile(`[\dA-Z]+[A-D]馆`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || len(line) > 50 {
			continue
		}
		// Skip lines that are pure booth numbers
		if boothPattern.MatchString(line) && len(line) < 15 {
			continue
		}
		// Skip common non-company lines
		if strings.HasPrefix(line, "公司名称") || strings.HasPrefix(line, "展馆") {
			continue
		}
		// If line contains a booth reference, it's likely a company name
		if !seen[line] {
			seen[line] = true
			companies = append(companies, line)
		}
	}

	return companies
}

// Helper: format company list for display
func formatCompanyList(companies []string, max int) string {
	if len(companies) > max {
		companies = companies[:max]
	}
	var items []string
	for _, c := range companies {
		items = append(items, "- "+c)
	}
	result := strings.Join(items, "\n")
	if max < len(companies) {
		result += "\n- ……等更多展商"
	}
	return result
}

var qaCounter int

// newQA is a helper to create QAPair with the new field structure.
func newQA(question, shortAnswer, detailAnswer, category, sourceURL string, years, tags []string, priority string) QAPair {
	qaCounter++
	year := ""
	if len(years) > 0 {
		year = years[0]
	}
	return QAPair{
		KnowledgeID:  fmt.Sprintf("KB-NEW-%03d", qaCounter),
		Question:     question,
		ShortAnswer:  shortAnswer,
		DetailAnswer: detailAnswer,
		Category:     category,
		Year:         year,
		Tags:         tags,
		Priority:     priority,
		SourceURL:    sourceURL,
		Hash:         contentHash(question + detailAnswer),
	}
}

func contentHash(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h[:8])
}

// ToPendingFields converts a QAPair to pending review table fields.
// Fields match the knowledge table structure + review-specific fields.
func (q *QAPair) ToPendingFields(changeType, changeDesc, relatedID string) map[string]interface{} {
	tag := ""
	if len(q.Tags) > 0 {
		tag = q.Tags[0]
	}
	fields := map[string]interface{}{
		// Knowledge table fields
		"知识ID":   q.KnowledgeID,
		"问题/主题":  q.Question,
		"简短回答":   q.ShortAnswer,
		"详细内容":   q.DetailAnswer,
		"分类":     q.Category,
		"适用年份":   q.Year,
		"标签":     tag,
		"优先级":    q.Priority,
		"状态":     "待发布",
		"最后更新":   time.Now().UnixMilli(),
		// Review-specific fields
		"变更类型":   changeType,
		"变更说明":   changeDesc,
		"关联知识ID": relatedID,
		"审核状态":   "待审核",
	}
	return fields
}
