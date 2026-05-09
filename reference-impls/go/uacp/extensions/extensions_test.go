package extensions_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/hn2/uacp-go/uacp/extensions"
)

func minimal(over map[string]any) map[string]any {
	doc := map[string]any{
		"uacp": "0.6.0", "id": "i", "tool": "t",
		"messages": []any{map[string]any{"role": "user", "content": "h"}},
	}
	for k, v := range over {
		doc[k] = v
	}
	return doc
}

func hasCode(errs []extensions.ExtensionError, code string) bool {
	for _, e := range errs {
		if e.Code == code {
			return true
		}
	}
	return false
}

// ---------- branching ----------

func TestBranching_simple(t *testing.T) {
	r := extensions.ValidateBranching(minimal(map[string]any{
		"messages": []any{
			map[string]any{"id": "m1", "role": "user", "content": "a"},
			map[string]any{"id": "m2", "role": "assistant", "content": "b"},
			map[string]any{"id": "m3", "role": "user", "content": "a2", "branch_parent_id": "m1", "branch_label": "edit"},
		},
	}))
	if !r.Valid {
		t.Fatalf("expected valid, got: %+v", r.Errors)
	}
}

func TestBranching_dangling(t *testing.T) {
	r := extensions.ValidateBranching(minimal(map[string]any{
		"messages": []any{
			map[string]any{"id": "m1", "role": "user", "content": "a"},
			map[string]any{"id": "m2", "role": "assistant", "content": "b", "branch_parent_id": "ghost"},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "branch_parent_id_dangling") {
		t.Fatalf("expected dangling error, got: %+v", r.Errors)
	}
}

func TestBranching_self(t *testing.T) {
	r := extensions.ValidateBranching(minimal(map[string]any{
		"messages": []any{
			map[string]any{"id": "m1", "role": "user", "content": "a"},
			map[string]any{"id": "m2", "role": "assistant", "content": "b", "branch_parent_id": "m2"},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "branch_parent_id_self_reference") {
		t.Fatalf("expected self-reference error, got: %+v", r.Errors)
	}
}

func TestBranching_cycle(t *testing.T) {
	r := extensions.ValidateBranching(minimal(map[string]any{
		"messages": []any{
			map[string]any{"id": "m1", "role": "user", "content": "a", "branch_parent_id": "m2"},
			map[string]any{"id": "m2", "role": "assistant", "content": "b", "branch_parent_id": "m1"},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "branch_parent_id_cycle") {
		t.Fatalf("expected cycle error, got: %+v", r.Errors)
	}
}

func TestBranching_labelTooLong(t *testing.T) {
	label := ""
	for i := 0; i < 257; i++ {
		label += "X"
	}
	r := extensions.ValidateBranching(minimal(map[string]any{
		"messages": []any{
			map[string]any{"id": "m1", "role": "user", "content": "a"},
			map[string]any{"id": "m2", "role": "assistant", "content": "b", "branch_label": label},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "branch_label_too_long") {
		t.Fatalf("expected label_too_long error, got: %+v", r.Errors)
	}
}

// ---------- reasoning ----------

func TestReasoning_valid(t *testing.T) {
	r := extensions.ValidateReasoning(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": []any{
				map[string]any{"type": "thinking", "text": "r", "model_visibility": "visible", "tokens": float64(5)},
				map[string]any{"type": "text", "text": "ans"},
			}},
		},
	}))
	if !r.Valid {
		t.Fatalf("expected valid, got: %+v", r.Errors)
	}
}

func TestReasoning_missingText(t *testing.T) {
	r := extensions.ValidateReasoning(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": []any{
				map[string]any{"type": "thinking", "model_visibility": "hidden"},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "thinking_missing_text") {
		t.Fatalf("expected missing_text error, got: %+v", r.Errors)
	}
}

func TestReasoning_invalidVisibility(t *testing.T) {
	r := extensions.ValidateReasoning(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": []any{
				map[string]any{"type": "thinking", "text": "r", "model_visibility": "public"},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "model_visibility_invalid") {
		t.Fatalf("expected visibility error, got: %+v", r.Errors)
	}
}

func TestReasoning_negativeTokens(t *testing.T) {
	r := extensions.ValidateReasoning(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": []any{
				map[string]any{"type": "thinking", "text": "r", "tokens": float64(-1)},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "tokens_negative") {
		t.Fatalf("expected tokens_negative error, got: %+v", r.Errors)
	}
}

// ---------- citations ----------

func TestCitations_webRetrievedAt(t *testing.T) {
	r := extensions.ValidateCitations(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "Hi", "citations": []any{
				map[string]any{
					"source":       map[string]any{"kind": "web", "url": "https://example.com"},
					"retrieved_at": "2026-05-09T12:00:00Z",
					"anchor":       map[string]any{"start": float64(0), "end": float64(2)},
				},
			}},
		},
	}))
	if !r.Valid {
		t.Fatalf("expected valid, got: %+v", r.Errors)
	}
}

func TestCitations_webMissingRetrievedAt(t *testing.T) {
	r := extensions.ValidateCitations(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "Hi", "citations": []any{
				map[string]any{
					"source": map[string]any{"kind": "web", "url": "https://example.com"},
					"anchor": map[string]any{"start": float64(0), "end": float64(2)},
				},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "web_missing_retrieved_at") {
		t.Fatalf("expected web_missing_retrieved_at error, got: %+v", r.Errors)
	}
}

func TestCitations_endBeforeStart(t *testing.T) {
	r := extensions.ValidateCitations(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "Hello", "citations": []any{
				map[string]any{
					"source": map[string]any{"kind": "document", "id": "d"},
					"anchor": map[string]any{"start": float64(5), "end": float64(1)},
				},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "anchor_end_before_start") {
		t.Fatalf("expected anchor_end_before_start error, got: %+v", r.Errors)
	}
}

func TestCitations_anchorNoBranch(t *testing.T) {
	r := extensions.ValidateCitations(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "h", "citations": []any{
				map[string]any{
					"source": map[string]any{"kind": "document", "id": "d"},
					"anchor": map[string]any{},
				},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "anchor_no_branch_matched") {
		t.Fatalf("expected anchor_no_branch_matched error, got: %+v", r.Errors)
	}
}

// ---------- artifacts ----------

func TestArtifacts_v1(t *testing.T) {
	r := extensions.ValidateArtifacts(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{
					"id": "a1", "type": "code", "title": "t", "content": "c",
					"version": float64(1), "artifact_lineage_id": "lin-1",
				},
			}},
		},
	}))
	if !r.Valid {
		t.Fatalf("expected valid, got: %+v", r.Errors)
	}
}

func TestArtifacts_chain(t *testing.T) {
	r := extensions.ValidateArtifacts(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a1", "type": "code", "title": "t", "content": "v1",
					"version": float64(1), "artifact_lineage_id": "lin-1"},
			}},
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a2", "type": "code", "title": "t", "content": "v2",
					"version": float64(2), "artifact_lineage_id": "lin-1", "previous_version_id": "a1"},
			}},
		},
	}))
	if !r.Valid {
		t.Fatalf("expected valid, got: %+v", r.Errors)
	}
}

func TestArtifacts_missingPrev(t *testing.T) {
	r := extensions.ValidateArtifacts(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a1", "type": "code", "title": "t", "content": "v1",
					"version": float64(1), "artifact_lineage_id": "lin-1"},
			}},
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a2", "type": "code", "title": "t", "content": "v2",
					"version": float64(2), "artifact_lineage_id": "lin-1"},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "previous_version_id_missing") {
		t.Fatalf("expected previous_version_id_missing error, got: %+v", r.Errors)
	}
}

func TestArtifacts_zeroVersion(t *testing.T) {
	r := extensions.ValidateArtifacts(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a1", "type": "code", "title": "t", "content": "c",
					"version": float64(0), "artifact_lineage_id": "lin-1"},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "version_invalid") {
		t.Fatalf("expected version_invalid error, got: %+v", r.Errors)
	}
}

func TestArtifacts_dangling(t *testing.T) {
	r := extensions.ValidateArtifacts(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a2", "type": "code", "title": "t", "content": "v2",
					"version": float64(2), "artifact_lineage_id": "lin-1", "previous_version_id": "ghost"},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "previous_version_id_dangling") {
		t.Fatalf("expected previous_version_id_dangling error, got: %+v", r.Errors)
	}
}

func TestArtifacts_lineageMismatch(t *testing.T) {
	r := extensions.ValidateArtifacts(minimal(map[string]any{
		"messages": []any{
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a1", "type": "code", "title": "t", "content": "v1",
					"version": float64(1), "artifact_lineage_id": "lin-1"},
			}},
			map[string]any{"role": "assistant", "content": "x", "artifacts": []any{
				map[string]any{"id": "a2", "type": "code", "title": "t", "content": "v2",
					"version": float64(2), "artifact_lineage_id": "lin-OTHER", "previous_version_id": "a1"},
			}},
		},
	}))
	if r.Valid || !hasCode(r.Errors, "lineage_id_mismatch") {
		t.Fatalf("expected lineage_id_mismatch error, got: %+v", r.Errors)
	}
}

// ---------- vector files ----------

func runVectorDir(t *testing.T, subdir string, validator func(map[string]any) extensions.ExtensionResult) {
	dir := filepath.Join("..", "..", "..", "..", "test-vectors", "extensions", subdir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skipf("vectors dir not found: %s", dir)
		return
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		name := e.Name()
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil {
				t.Fatalf("read %s: %v", name, err)
			}
			var doc map[string]any
			if err := json.Unmarshal(data, &doc); err != nil {
				t.Fatalf("parse %s: %v", name, err)
			}
			expectInvalid := false
			if md, ok := doc["metadata"].(map[string]any); ok {
				if v, ok := md["uacp.test.expect"].(string); ok && v == "invalid" {
					expectInvalid = true
				}
			}
			r := validator(doc)
			if expectInvalid && r.Valid {
				t.Errorf("%s: expected invalid but valid", name)
			}
			if !expectInvalid && !r.Valid {
				t.Errorf("%s: expected valid but got %+v", name, r.Errors)
			}
		})
	}
}

func TestVectors_branching(t *testing.T) {
	runVectorDir(t, "branching", extensions.ValidateBranching)
}
func TestVectors_reasoning(t *testing.T) {
	runVectorDir(t, "reasoning", extensions.ValidateReasoning)
}
func TestVectors_citations(t *testing.T) {
	runVectorDir(t, "citations", extensions.ValidateCitations)
}
func TestVectors_artifacts(t *testing.T) {
	runVectorDir(t, "artifacts", extensions.ValidateArtifacts)
}
