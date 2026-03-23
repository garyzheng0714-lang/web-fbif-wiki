package scraper

import (
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

// Article represents a scraped article.
type Article struct {
	URL       string
	Title     string
	Content   string
	Links     []string // internal links found in the article
	ScrapedAt time.Time
}

// Scraper handles headless browser scraping.
type Scraper struct {
	browser *rod.Browser
}

// New creates a new scraper with a headless browser.
func New() (*Scraper, error) {
	path, _ := launcher.LookPath()
	u := launcher.New().Bin(path).Headless(true).MustLaunch()
	browser := rod.New().ControlURL(u).MustConnect()
	return &Scraper{browser: browser}, nil
}

// Close shuts down the browser.
func (s *Scraper) Close() {
	if s.browser != nil {
		s.browser.MustClose()
	}
}

// ScrapeURL renders a JS page and extracts article content.
func (s *Scraper) ScrapeURL(targetURL string) (*Article, error) {
	page := s.browser.MustPage(targetURL)
	defer page.MustClose()

	// Wait for page load
	page.MustWaitLoad()

	// Wait for Vue/React SPA to render content
	time.Sleep(5 * time.Second)

	// Extract all text using simple innerText — most reliable for SPAs
	titleResult, err := page.Eval(`() => document.title || ""`)
	title := ""
	if err == nil {
		title = strings.TrimSpace(titleResult.Value.Str())
	}

	textResult, err := page.Eval(`() => document.body.innerText || ""`)
	content := ""
	if err == nil {
		content = textResult.Value.Str()
	}

	// Extract internal links
	linksResult, err := page.Eval(`() => {
		return Array.from(document.querySelectorAll('a[href]'))
			.map(a => a.href)
			.filter(h => h && h.includes('/news/') && h.includes('foodtalks.cn'));
	}`)
	var links []string
	if err == nil {
		for _, v := range linksResult.Value.Arr() {
			href := v.Str()
			if href != "" && href != targetURL {
				links = append(links, href)
			}
		}
	}

	// Deduplicate links
	seen := make(map[string]bool)
	var uniqueLinks []string
	for _, l := range links {
		normalized := normalizeURL(l)
		if !seen[normalized] {
			seen[normalized] = true
			uniqueLinks = append(uniqueLinks, l)
		}
	}

	return &Article{
		URL:       targetURL,
		Title:     title,
		Content:   content,
		Links:     uniqueLinks,
		ScrapedAt: time.Now(),
	}, nil
}

// ScrapeWithDepth scrapes the initial URL and optionally follows internal links.
func (s *Scraper) ScrapeWithDepth(targetURL string, maxDepth int) ([]*Article, error) {
	visited := make(map[string]bool)
	var articles []*Article

	queue := []struct {
		url   string
		depth int
	}{{url: targetURL, depth: 0}}

	for len(queue) > 0 {
		item := queue[0]
		queue = queue[1:]

		normalized := normalizeURL(item.url)
		if visited[normalized] || item.depth > maxDepth {
			continue
		}
		visited[normalized] = true

		log.Printf("scraping [depth=%d]: %s", item.depth, item.url)
		article, err := s.ScrapeURL(item.url)
		if err != nil {
			log.Printf("warning: failed to scrape %s: %v", item.url, err)
			continue
		}

		articles = append(articles, article)

		// Queue internal links for deeper scraping
		if item.depth < maxDepth {
			for _, link := range article.Links {
				if !visited[normalizeURL(link)] {
					queue = append(queue, struct {
						url   string
						depth int
					}{url: link, depth: item.depth + 1})
				}
			}
		}
	}

	return articles, nil
}

func extractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}

func normalizeURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	u.Fragment = ""
	u.RawQuery = ""
	return u.String()
}

