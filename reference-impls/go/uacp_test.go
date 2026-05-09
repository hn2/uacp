package uacp_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/hn2/uacp-go/uacp"
)

var minimal = map[string]any{
	"uacp": "0.6.0",
	"id":   "test-conv-id-001",
	"tool": "test-tool",
	"messages": []any{
		map[string]any{"role": "user", "content": "Hello"},
	},
}

func copyMinimal(overrides map[string]any) map[string]any {
	doc := map[string]any{}
	for k, v := range minimal {
		doc[k] = v
	}
	for k, v := range overrides {
		doc[k] = v
	}
	return doc
}

func minimalWithout(key string) map[string]any {
	doc := map[string]any{}
	for k, v := range minimal {
		if k != key {
			doc[k] = v
		}
	}
	return doc
}

// TestValidate_minimal checks that a valid minimal document passes.
func TestValidate_minimal(t *testing.T) {
	r := uacp.Validate(minimal)
	if !r.OK {
		t.Fatalf("expected OK, got errors: %v", r.Errors)
	}
}

// TestValidate_missingFields checks that missing required fields each produce errors.
func TestValidate_missingFields(t *testing.T) {
	for _, field := range []string{"uacp", "id", "tool", "messages"} {
		r := uacp.Validate(minimalWithout(field))
		if r.OK {
			t.Errorf("expected failure when %q is missing", field)
		}
		found := false
		for _, e := range r.Errors {
			if len(e) > 0 && contains(e, field) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected error mentioning %q, got: %v", field, r.Errors)
		}
	}
}

// TestValidate_emptyMessages checks that an empty messages array fails.
func TestValidate_emptyMessages(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{"messages": []any{}}))
	if r.OK {
		t.Fatal("expected failure for empty messages")
	}
	if !anyContains(r.Errors, "messages") {
		t.Errorf("expected error mentioning 'messages', got: %v", r.Errors)
	}
}

// TestValidate_invalidRole checks that an invalid role fails.
func TestValidate_invalidRole(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"messages": []any{map[string]any{"role": "bot", "content": "hi"}},
	}))
	if r.OK {
		t.Fatal("expected failure for invalid role")
	}
	if !anyContains(r.Errors, "role") {
		t.Errorf("expected error mentioning 'role', got: %v", r.Errors)
	}
}

// TestValidate_contentBlocks checks that valid text/thinking/code blocks pass.
func TestValidate_contentBlocks(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"messages": []any{map[string]any{
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello"},
				map[string]any{"type": "thinking", "text": "reasoning..."},
				map[string]any{"type": "code", "code": `print("hi")`, "language": "python"},
			},
		}},
	}))
	if !r.OK {
		t.Fatalf("expected OK, got errors: %v", r.Errors)
	}
}

// TestValidate_invalidContentBlockType checks that an unknown content block type fails.
func TestValidate_invalidContentBlockType(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"messages": []any{map[string]any{
			"role":    "user",
			"content": []any{map[string]any{"type": "unknown-type"}},
		}},
	}))
	if r.OK {
		t.Fatal("expected failure for unknown content block type")
	}
	if !anyContains(r.Errors, "type") {
		t.Errorf("expected error mentioning 'type', got: %v", r.Errors)
	}
}

// TestValidate_citations checks that a valid citation passes.
func TestValidate_citations(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"messages": []any{map[string]any{
			"role":    "assistant",
			"content": "Source: ...",
			"citations": []any{
				map[string]any{
					"span":   []any{float64(0), float64(6)},
					"source": map[string]any{"url": "https://example.com"},
				},
			},
		}},
	}))
	if !r.OK {
		t.Fatalf("expected OK, got errors: %v", r.Errors)
	}
}

// TestValidate_citationMissingURL checks that a citation without source.url fails.
func TestValidate_citationMissingURL(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"messages": []any{map[string]any{
			"role":    "assistant",
			"content": "text",
			"citations": []any{
				map[string]any{
					"span":   []any{float64(0), float64(1)},
					"source": map[string]any{},
				},
			},
		}},
	}))
	if r.OK {
		t.Fatal("expected failure for citation without source.url")
	}
	if !anyContains(r.Errors, "source.url") {
		t.Errorf("expected error mentioning 'source.url', got: %v", r.Errors)
	}
}

// TestValidate_artifacts checks that a valid artifact passes.
func TestValidate_artifacts(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"messages": []any{map[string]any{
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Here is the code"},
				map[string]any{"type": "artifact_ref", "id": "art-1"},
			},
			"artifacts": []any{
				map[string]any{
					"id":      "art-1",
					"type":    "code",
					"title":   "example.py",
					"content": "x = 1",
				},
			},
		}},
	}))
	if !r.OK {
		t.Fatalf("expected OK, got errors: %v", r.Errors)
	}
}

// TestValidate_extensionsLimit checks 33 items fails and 32 passes.
func TestValidate_extensionsLimit(t *testing.T) {
	make32 := func(n int) []any {
		s := make([]any, n)
		for i := range s {
			s[i] = "ext"
		}
		return s
	}

	r32 := uacp.Validate(copyMinimal(map[string]any{"extensions": make32(32)}))
	if !r32.OK {
		t.Fatalf("32 extensions should pass, got errors: %v", r32.Errors)
	}

	r33 := uacp.Validate(copyMinimal(map[string]any{"extensions": make32(33)}))
	if r33.OK {
		t.Fatal("33 extensions should fail")
	}
	if !anyContains(r33.Errors, "extensions") {
		t.Errorf("expected error mentioning 'extensions', got: %v", r33.Errors)
	}
}

// TestValidate_timestamps checks valid ISO timestamps pass, invalid ones fail.
func TestValidate_timestamps(t *testing.T) {
	r := uacp.Validate(copyMinimal(map[string]any{
		"created_at": "2026-05-09T12:00:00Z",
		"updated_at": "2026-05-09T12:00:01.000Z",
	}))
	if !r.OK {
		t.Fatalf("valid timestamps should pass, got: %v", r.Errors)
	}

	r2 := uacp.Validate(copyMinimal(map[string]any{"created_at": "not-a-date"}))
	if r2.OK {
		t.Fatal("invalid timestamp should fail")
	}
	if !anyContains(r2.Errors, "created_at") {
		t.Errorf("expected error mentioning 'created_at', got: %v", r2.Errors)
	}
}

// TestParse_validJSON checks parsing a valid JSON document.
func TestParse_validJSON(t *testing.T) {
	data, _ := json.Marshal(minimal)
	doc, err := uacp.Parse(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if doc.ID != "test-conv-id-001" {
		t.Errorf("expected id %q, got %q", "test-conv-id-001", doc.ID)
	}
}

// TestParse_invalidJSON checks that invalid JSON returns an error.
func TestParse_invalidJSON(t *testing.T) {
	_, err := uacp.Parse([]byte(`{bad json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// TestSerialize_roundtrip checks that parse → serialize preserves data.
func TestSerialize_roundtrip(t *testing.T) {
	complex := map[string]any{
		"uacp":       "0.6.0",
		"id":         "round-trip-001",
		"tool":       "test",
		"title":      "Round-trip test",
		"created_at": "2026-05-09T00:00:00Z",
		"messages": []any{
			map[string]any{"role": "user", "content": "Write a bubble sort function"},
			map[string]any{
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Here it is:"},
					map[string]any{"type": "code", "code": "def bubble_sort(arr): pass", "language": "python"},
				},
			},
		},
	}

	data, _ := json.Marshal(complex)
	doc, err := uacp.Parse(data)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}

	out, err := uacp.Serialize(doc)
	if err != nil {
		t.Fatalf("serialize failed: %v", err)
	}

	var back map[string]any
	if err := json.Unmarshal(out, &back); err != nil {
		t.Fatalf("unmarshal round-trip output failed: %v", err)
	}
	if back["id"] != "round-trip-001" {
		t.Errorf("id mismatch: got %v", back["id"])
	}
	if back["title"] != "Round-trip test" {
		t.Errorf("title mismatch: got %v", back["title"])
	}
	msgs, _ := back["messages"].([]any)
	if len(msgs) != 2 {
		t.Errorf("expected 2 messages, got %d", len(msgs))
	}
}

// TestVectors_valid checks that all valid test vectors pass validation.
func TestVectors_valid(t *testing.T) {
	vectorsDir := filepath.Join("..", "..", "test-vectors")

	invalidSet := map[string]bool{
		"09-encrypted-envelope.uacp.json":                        true,
		"10-export-bundle.uacp.json":                             true,
		"11-empty-messages-refused.uacp.json":                    true,
		"19-provenance-confidence-on-extracted-rejected.uacp.json": true,
	}

	entries, err := os.ReadDir(vectorsDir)
	if err != nil {
		t.Fatalf("failed to read test-vectors dir: %v", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		name := entry.Name()
		if invalidSet[name] {
			continue
		}

		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(vectorsDir, name))
			if err != nil {
				t.Fatalf("failed to read %s: %v", name, err)
			}
			var doc map[string]any
			if err := json.Unmarshal(data, &doc); err != nil {
				t.Fatalf("failed to parse JSON %s: %v", name, err)
			}
			r := uacp.Validate(doc)
			if !r.OK {
				t.Errorf("%s should be valid but got errors: %v", name, r.Errors)
			}
		})
	}
}

// TestVectors_invalid checks that all invalid test vectors fail validation.
func TestVectors_invalid(t *testing.T) {
	vectorsDir := filepath.Join("..", "..", "test-vectors")

	rootInvalid := []string{
		"09-encrypted-envelope.uacp.json",
		"10-export-bundle.uacp.json",
		"11-empty-messages-refused.uacp.json",
		"19-provenance-confidence-on-extracted-rejected.uacp.json",
	}

	for _, name := range rootInvalid {
		name := name
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(vectorsDir, name))
			if err != nil {
				t.Fatalf("failed to read %s: %v", name, err)
			}
			var doc map[string]any
			if err := json.Unmarshal(data, &doc); err != nil {
				t.Fatalf("failed to parse JSON %s: %v", name, err)
			}
			r := uacp.Validate(doc)
			if r.OK {
				t.Errorf("%s should be invalid but validate() returned OK", name)
			}
		})
	}

	invalidDir := filepath.Join(vectorsDir, "invalid")
	entries, err := os.ReadDir(invalidDir)
	if err != nil {
		t.Fatalf("failed to read invalid dir: %v", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		name := entry.Name()
		t.Run("invalid/"+name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(invalidDir, name))
			if err != nil {
				t.Fatalf("failed to read %s: %v", name, err)
			}
			var doc map[string]any
			if err := json.Unmarshal(data, &doc); err != nil {
				t.Fatalf("failed to parse JSON %s: %v", name, err)
			}
			r := uacp.Validate(doc)
			if r.OK {
				t.Errorf("invalid/%s should be invalid but validate() returned OK", name)
			}
		})
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}())
}

func anyContains(errs []string, substr string) bool {
	for _, e := range errs {
		if contains(e, substr) {
			return true
		}
	}
	return false
}
