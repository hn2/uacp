package extensions

import (
	"fmt"
	"regexp"
)

var validCitationKinds = map[string]bool{
	"web": true, "document": true, "vector_store": true,
	"tool_result": true, "user_attachment": true,
}

var rfc3339RE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$`)

func flattenedTextLength(content any) int {
	if s, ok := content.(string); ok {
		return codepointLen(s)
	}
	arr, ok := content.([]any)
	if !ok {
		return 0
	}
	n := 0
	for _, blk := range arr {
		m, ok := blk.(map[string]any)
		if !ok {
			continue
		}
		if m["type"] == "text" {
			if t, ok := m["text"].(string); ok {
				n += codepointLen(t)
			}
		}
	}
	return n
}

func isInteger(v any) (int, bool) {
	switch n := v.(type) {
	case float64:
		if n != float64(int64(n)) {
			return 0, false
		}
		return int(n), true
	case int:
		return n, true
	case int64:
		return int(n), true
	}
	return 0, false
}

func validateAnchor(anchor any, path string, errors *[]ExtensionError, textLen int) {
	a, ok := anchor.(map[string]any)
	if !ok {
		*errors = append(*errors, extErr(path, "anchor_invalid", "anchor must be an object"))
		return
	}
	_, hasStart := a["start"]
	_, hasEnd := a["end"]
	hasStartEnd := hasStart || hasEnd
	_, hasSelector := a["selector"]
	_, hasPage := a["page"]

	branches := 0
	if hasStartEnd {
		branches++
	}
	if hasSelector {
		branches++
	}
	if hasPage {
		branches++
	}
	if branches == 0 {
		*errors = append(*errors, extErr(path, "anchor_no_branch_matched",
			"anchor must have one of: (start+end), selector, or page"))
		return
	}
	if branches > 1 {
		*errors = append(*errors, extErr(path, "anchor_multiple_branches",
			"anchor must have exactly one of: (start+end), selector, or page"))
		return
	}

	if hasStartEnd {
		startInt, startOK := isInteger(a["start"])
		endInt, endOK := isInteger(a["end"])
		if !startOK || startInt < 0 {
			*errors = append(*errors, extErr(path+".start", "anchor_start_invalid",
				"start must be a non-negative integer"))
		}
		if !endOK || endInt < 0 {
			*errors = append(*errors, extErr(path+".end", "anchor_end_invalid",
				"end must be a non-negative integer"))
		}
		if startOK && endOK {
			if endInt < startInt {
				*errors = append(*errors, extErr(path, "anchor_end_before_start",
					"anchor.end must be greater than or equal to anchor.start"))
			}
			if textLen > 0 && endInt > textLen {
				*errors = append(*errors, extErr(path, "anchor_out_of_range",
					fmt.Sprintf("anchor.end (%d) is past the end of message text (length %d codepoints)", endInt, textLen)))
			}
			if textLen > 0 && startInt > textLen {
				*errors = append(*errors, extErr(path, "anchor_out_of_range",
					fmt.Sprintf("anchor.start (%d) is past the end of message text (length %d codepoints)", startInt, textLen)))
			}
		}
	}
	if hasSelector {
		sel, ok := a["selector"].(string)
		if !ok || sel == "" {
			*errors = append(*errors, extErr(path+".selector", "anchor_selector_invalid",
				"selector must be a non-empty string"))
		}
	}
	if hasPage {
		page, ok := isInteger(a["page"])
		if !ok || page < 1 {
			*errors = append(*errors, extErr(path+".page", "anchor_page_invalid",
				"page must be an integer >= 1"))
		}
	}
}

// ValidateCitations enforces the uacp-citations extension rules.
func ValidateCitations(doc map[string]any) ExtensionResult {
	errors := []ExtensionError{}
	messagesRaw, _ := doc["messages"].([]any)

	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		citations, ok := m["citations"].([]any)
		if !ok {
			continue
		}
		textLen := flattenedTextLength(m["content"])

		for j, cRaw := range citations {
			path := fmt.Sprintf("messages[%d].citations[%d]", i, j)
			c, ok := cRaw.(map[string]any)
			if !ok {
				errors = append(errors, extErr(path, "citation_invalid", "citation must be an object"))
				continue
			}

			source, _ := c["source"].(map[string]any)
			_, hasAnchor := c["anchor"]
			_, hasKind := func() (any, bool) {
				if source == nil {
					return nil, false
				}
				v, ok := source["kind"]
				return v, ok
			}()
			if !hasAnchor && !hasKind {
				continue
			}

			if source == nil {
				errors = append(errors, extErr(path+".source", "source_invalid", "source must be an object"))
				continue
			}
			kind, _ := source["kind"].(string)
			if !validCitationKinds[kind] {
				errors = append(errors, extErr(path+".source.kind", "source_kind_invalid",
					"source.kind must be one of: document, tool_result, user_attachment, vector_store, web"))
			}

			retrievedAtRaw, hasRetrievedAt := c["retrieved_at"]
			if kind == "web" && !hasRetrievedAt {
				errors = append(errors, extErr(path+".retrieved_at", "web_missing_retrieved_at",
					"retrieved_at is required when source.kind is \"web\""))
			}
			if hasRetrievedAt {
				ra, ok := retrievedAtRaw.(string)
				if !ok || !rfc3339RE.MatchString(ra) {
					errors = append(errors, extErr(path+".retrieved_at", "retrieved_at_invalid",
						"retrieved_at must be an RFC 3339 / ISO 8601 datetime string"))
				}
			}

			if confidenceRaw, hasConf := c["confidence"]; hasConf {
				conf, ok := confidenceRaw.(float64)
				if !ok || conf < 0 || conf > 1 {
					errors = append(errors, extErr(path+".confidence", "confidence_invalid",
						"confidence must be a number between 0 and 1"))
				}
			}

			if !hasAnchor {
				errors = append(errors, extErr(path+".anchor", "anchor_missing", "anchor is required"))
			} else {
				validateAnchor(c["anchor"], path+".anchor", &errors, textLen)
			}
		}
	}

	return ExtensionResult{Valid: len(errors) == 0, Errors: errors}
}
