package uacp

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	semverRE  = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
	iso8601RE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$`)
)

var validRoles = map[string]bool{
	"user": true, "assistant": true, "system": true, "tool": true,
}

var validContentTypes = map[string]bool{
	"text": true, "image": true, "file": true, "code": true,
	"thinking": true, "artifact_ref": true, "audio": true,
	"video": true, "pdf": true, "latex": true,
}

var validArtifactTypes = map[string]bool{
	"code": true, "html": true, "svg": true,
	"markdown": true, "react": true, "text": true,
}

var validMsgStatus = map[string]bool{
	"complete": true, "in_progress": true, "error": true,
}

var validPrivacy = map[string]bool{
	"private": true, "personal": true, "team": true, "public": true,
}

var validProvenance = map[string]bool{
	"extracted": true, "inferred": true, "system": true, "tool_output": true,
}

// Result is returned by Validate.
type Result struct {
	OK     bool
	Errors []string
}

// Validate validates a raw decoded JSON document (map[string]any).
func Validate(doc any) Result {
	errors := []string{}

	m, ok := doc.(map[string]any)
	if !ok {
		return Result{OK: false, Errors: []string{"Root must be a JSON object"}}
	}

	uacp, _ := m["uacp"].(string)
	if uacp == "" || !semverRE.MatchString(uacp) {
		errors = append(errors, `uacp: must be a semver string (e.g. "0.6.0")`)
	}

	docID, _ := m["id"].(string)
	if strings.TrimSpace(docID) == "" {
		errors = append(errors, "id: required, must be a non-empty string")
	}

	tool := m["tool"]
	if tool == nil {
		errors = append(errors, "tool: required, must be a string or array of strings")
	} else {
		switch v := tool.(type) {
		case string:
		case []any:
			for _, t := range v {
				if _, ok := t.(string); !ok {
					errors = append(errors, "tool: must be a string or array of strings")
					break
				}
			}
		default:
			errors = append(errors, "tool: must be a string or array of strings")
		}
	}

	messages, hasMsgs := m["messages"]
	if !hasMsgs || messages == nil {
		errors = append(errors, "messages: required, must be an array")
	} else {
		msgs, ok := messages.([]any)
		if !ok {
			errors = append(errors, "messages: required, must be an array")
		} else if len(msgs) == 0 {
			errors = append(errors, "messages: must contain at least one message")
		} else {
			for i, msg := range msgs {
				validateMessage(msg, i, &errors)
			}
		}
	}

	if privacy, ok := m["privacy"].(string); ok {
		if !validPrivacy[privacy] {
			errors = append(errors, fmt.Sprintf("privacy: must be one of %s", joinSorted(validPrivacy)))
		}
	}

	if createdAt, ok := m["created_at"].(string); ok {
		if !iso8601RE.MatchString(createdAt) {
			errors = append(errors, "created_at: must be an ISO 8601 datetime string")
		}
	}

	if updatedAt, ok := m["updated_at"].(string); ok {
		if !iso8601RE.MatchString(updatedAt) {
			errors = append(errors, "updated_at: must be an ISO 8601 datetime string")
		}
	}

	if ext, exists := m["extensions"]; exists && ext != nil {
		exts, ok := ext.([]any)
		if !ok {
			errors = append(errors, "extensions: must be an array")
		} else if len(exts) > 32 {
			errors = append(errors, "extensions: must not contain more than 32 items")
		}
	}

	if branches, exists := m["branches"]; exists && branches != nil {
		if _, ok := branches.([]any); !ok {
			errors = append(errors, "branches: must be an array of strings")
		}
	}

	if len(errors) > 0 {
		return Result{OK: false, Errors: errors}
	}
	return Result{OK: true}
}

func validateMessage(msg any, idx int, errors *[]string) {
	p := fmt.Sprintf("messages[%d]", idx)
	m, ok := msg.(map[string]any)
	if !ok {
		*errors = append(*errors, fmt.Sprintf("%s: must be an object", p))
		return
	}

	role, _ := m["role"].(string)
	if !validRoles[role] {
		*errors = append(*errors, fmt.Sprintf("%s.role: must be one of %s", p, joinSorted(validRoles)))
	}

	content, hasContent := m["content"]
	if !hasContent || content == nil {
		*errors = append(*errors, fmt.Sprintf("%s.content: required", p))
	} else {
		switch v := content.(type) {
		case string:
		case []any:
			for j, block := range v {
				validateContentBlock(block, fmt.Sprintf("%s.content[%d]", p, j), errors)
			}
		default:
			*errors = append(*errors, fmt.Sprintf("%s.content: must be a string or array of content blocks", p))
		}
	}

	if status, ok := m["status"].(string); ok {
		if !validMsgStatus[status] {
			*errors = append(*errors, fmt.Sprintf("%s.status: must be one of %s", p, joinSorted(validMsgStatus)))
		}
	}

	if ts, ok := m["timestamp"].(string); ok {
		if !iso8601RE.MatchString(ts) {
			*errors = append(*errors, fmt.Sprintf("%s.timestamp: must be an ISO 8601 datetime string", p))
		}
	}

	provenance, hasProvenance := m["provenance"].(string)
	if hasProvenance {
		if !validProvenance[provenance] {
			*errors = append(*errors, fmt.Sprintf("%s.provenance: must be one of %s", p, joinSorted(validProvenance)))
		}
	}

	_, hasConfidence := m["confidence"]
	if hasProvenance && provenance == "inferred" && !hasConfidence {
		*errors = append(*errors, fmt.Sprintf("%s.confidence: required when provenance=inferred", p))
	}
	if hasProvenance && provenance == "extracted" && hasConfidence {
		*errors = append(*errors, fmt.Sprintf("%s.confidence: must not be present when provenance=extracted", p))
	}

	if citations, exists := m["citations"]; exists && citations != nil {
		cits, ok := citations.([]any)
		if !ok {
			*errors = append(*errors, fmt.Sprintf("%s.citations: must be an array", p))
		} else {
			for j, c := range cits {
				validateCitation(c, fmt.Sprintf("%s.citations[%d]", p, j), errors)
			}
		}
	}

	if artifacts, exists := m["artifacts"]; exists && artifacts != nil {
		arts, ok := artifacts.([]any)
		if !ok {
			*errors = append(*errors, fmt.Sprintf("%s.artifacts: must be an array", p))
		} else {
			for j, a := range arts {
				validateArtifact(a, fmt.Sprintf("%s.artifacts[%d]", p, j), errors)
			}
		}
	}
}

func validateContentBlock(block any, prefix string, errors *[]string) {
	m, ok := block.(map[string]any)
	if !ok {
		*errors = append(*errors, fmt.Sprintf("%s: must be an object", prefix))
		return
	}

	btype, _ := m["type"].(string)
	if !validContentTypes[btype] {
		*errors = append(*errors, fmt.Sprintf("%s.type: must be one of %s", prefix, joinSorted(validContentTypes)))
		return
	}

	switch btype {
	case "text", "thinking", "latex":
		if _, ok := m["text"].(string); !ok {
			*errors = append(*errors, fmt.Sprintf("%s: %s block requires text (string)", prefix, btype))
		}
	case "code":
		if _, ok := m["code"].(string); !ok {
			*errors = append(*errors, fmt.Sprintf("%s: code block requires code (string)", prefix))
		}
	case "artifact_ref":
		if _, ok := m["id"].(string); !ok {
			*errors = append(*errors, fmt.Sprintf("%s: artifact_ref block requires id (string)", prefix))
		}
	case "image", "file", "audio", "video", "pdf":
		_, hasURL := m["url"].(string)
		_, hasData := m["data"].(string)
		if !hasURL && !hasData {
			*errors = append(*errors, fmt.Sprintf("%s: %s block requires url or data", prefix, btype))
		}
	}
}

func validateCitation(c any, prefix string, errors *[]string) {
	m, ok := c.(map[string]any)
	if !ok {
		*errors = append(*errors, fmt.Sprintf("%s: must be an object", prefix))
		return
	}

	span, _ := m["span"].([]any)
	if len(span) != 2 {
		*errors = append(*errors, fmt.Sprintf("%s.span: must be [int, int]", prefix))
	} else {
		for _, v := range span {
			switch v.(type) {
			case float64, int, int64:
			default:
				*errors = append(*errors, fmt.Sprintf("%s.span: must be [int, int]", prefix))
				break
			}
		}
	}

	source, sourceOK := m["source"].(map[string]any)
	if !sourceOK {
		*errors = append(*errors, fmt.Sprintf("%s.source.url: required", prefix))
		return
	}
	url, urlOK := source["url"].(string)
	if !urlOK {
		*errors = append(*errors, fmt.Sprintf("%s.source.url: required", prefix))
	} else if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		*errors = append(*errors, fmt.Sprintf("%s.source.url: must start with http:// or https://", prefix))
	}
}

func validateArtifact(a any, prefix string, errors *[]string) {
	m, ok := a.(map[string]any)
	if !ok {
		*errors = append(*errors, fmt.Sprintf("%s: must be an object", prefix))
		return
	}

	id, _ := m["id"].(string)
	if id == "" {
		*errors = append(*errors, fmt.Sprintf("%s.id: required", prefix))
	}

	atype, _ := m["type"].(string)
	if !validArtifactTypes[atype] {
		*errors = append(*errors, fmt.Sprintf("%s.type: must be one of %s", prefix, joinSorted(validArtifactTypes)))
	}

	title, _ := m["title"].(string)
	if title == "" {
		*errors = append(*errors, fmt.Sprintf("%s.title: required", prefix))
	}

	if _, ok := m["content"].(string); !ok {
		*errors = append(*errors, fmt.Sprintf("%s.content: required (string)", prefix))
	}
}

func joinSorted(m map[string]bool) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// simple sort
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[i] > keys[j] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return strings.Join(keys, ", ")
}
