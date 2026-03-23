package main

import (
	"bufio"
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeMessages(t *testing.T) {
	history := []chatRecord{
		{Role: "user", Content: " 第一轮问题 "},
		{Role: "assistant", Content: " 第一轮回答 "},
		{Role: "system", Content: "should be ignored"},
		{Role: "assistant", Content: "    "},
	}

	got := normalizeMessages(history, " 当前问题 ")
	want := []messageParam{
		{Role: "user", Content: "第一轮问题"},
		{Role: "assistant", Content: "第一轮回答"},
		{Role: "user", Content: "当前问题"},
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("normalizeMessages() mismatch\nwant: %#v\ngot:  %#v", want, got)
	}
}

func TestExtractDataPayload(t *testing.T) {
	tests := []struct {
		name  string
		frame string
		want  string
	}{
		{
			name:  "single data line",
			frame: "event: token\r\ndata: {\"foo\":\"bar\"}",
			want:  "{\"foo\":\"bar\"}",
		},
		{
			name:  "multi line data",
			frame: "data: first\r\ndata: second",
			want:  "first\nsecond",
		},
		{
			name:  "no data line",
			frame: "event: ping",
			want:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractDataPayload(tt.frame)
			if got != tt.want {
				t.Fatalf("extractDataPayload() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestScanDoubleCRLF(t *testing.T) {
	input := "data: a\r\n\r\ndata: b\n\ndata: c"
	scanner := bufio.NewScanner(strings.NewReader(input))
	scanner.Split(scanDoubleCRLF)

	var got []string
	for scanner.Scan() {
		got = append(got, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		t.Fatalf("scanner error: %v", err)
	}

	want := []string{"data: a", "data: b", "data: c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("scanDoubleCRLF mismatch\nwant: %#v\ngot:  %#v", want, got)
	}
}
