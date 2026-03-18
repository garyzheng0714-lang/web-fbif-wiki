package imagestore

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Store downloads and caches images locally, returning permanent URLs.
type Store struct {
	dir    string
	prefix string // URL prefix, e.g. "/images/"
	mu     sync.Mutex
	http   *http.Client
}

// New creates an image store. dir is the local filesystem path, prefix is the URL path.
func New(dir, prefix string) *Store {
	_ = os.MkdirAll(dir, 0755)
	return &Store{
		dir:    dir,
		prefix: prefix,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

// Persist downloads a remote image and returns a permanent local URL.
// If the image was already downloaded (same hash), returns the cached URL.
func (s *Store) Persist(remoteURL string) (string, error) {
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(remoteURL)))[:16]

	// Check if any file with this hash prefix exists
	s.mu.Lock()
	defer s.mu.Unlock()

	matches, _ := filepath.Glob(filepath.Join(s.dir, hash+".*"))
	if len(matches) > 0 {
		return s.prefix + filepath.Base(matches[0]), nil
	}

	// Download
	resp, err := s.http.Get(remoteURL)
	if err != nil {
		return "", fmt.Errorf("download image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download image: status %d", resp.StatusCode)
	}

	// Determine extension from content-type
	ext := ".jpg"
	ct := resp.Header.Get("Content-Type")
	switch {
	case strings.Contains(ct, "png"):
		ext = ".png"
	case strings.Contains(ct, "webp"):
		ext = ".webp"
	case strings.Contains(ct, "gif"):
		ext = ".gif"
	case strings.Contains(ct, "svg"):
		ext = ".svg"
	}

	filename := hash + ext
	fpath := filepath.Join(s.dir, filename)

	f, err := os.Create(fpath)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		os.Remove(fpath)
		return "", fmt.Errorf("write file: %w", err)
	}

	return s.prefix + filename, nil
}

// Dir returns the filesystem directory for serving.
func (s *Store) Dir() string {
	return s.dir
}
