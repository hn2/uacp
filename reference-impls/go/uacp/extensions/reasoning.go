package extensions

import (
	"fmt"
	"unicode/utf8"
)

const maxThinkingText = 1_000_000

var validVisibility = map[string]bool{
	"visible": true, "hidden": true, "redacted": true,
}

func codepointLen(s string) int {
	return utf8.RuneCountInString(s)
}

// ValidateReasoning enforces the uacp-reasoning extension rules:
// thinking content blocks MUST have a string text field of at most 1_000_000
// codepoints, an optional model_visibility from {visible, hidden, redacted},
// and an optional non-negative integer tokens field.
func ValidateReasoning(doc map[string]any) ExtensionResult {
	errors := []ExtensionError{}
	messagesRaw, _ := doc["messages"].([]any)

	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		content, ok := m["content"].([]any)
		if !ok {
			continue
		}
		for j, blockRaw := range content {
			block, ok := blockRaw.(map[string]any)
			if !ok {
				continue
			}
			if block["type"] != "thinking" {
				continue
			}
			path := fmt.Sprintf("messages[%d].content[%d]", i, j)

			text, hasText := block["text"].(string)
			if !hasText {
				errors = append(errors, extErr(path+".text", "thinking_missing_text",
					"thinking block must have a text field of type string"))
			} else if codepointLen(text) > maxThinkingText {
				errors = append(errors, extErr(path+".text", "thinking_text_too_long",
					fmt.Sprintf("thinking text must be at most %d Unicode codepoints", maxThinkingText)))
			}

			if visRaw, exists := block["model_visibility"]; exists {
				vis, ok := visRaw.(string)
				if !ok || !validVisibility[vis] {
					errors = append(errors, extErr(path+".model_visibility", "model_visibility_invalid",
						"model_visibility must be one of: visible, hidden, redacted"))
				}
			}

			if tokensRaw, exists := block["tokens"]; exists {
				if n, ok := tokensRaw.(float64); !ok || n < 0 || n != float64(int64(n)) {
					errors = append(errors, extErr(path+".tokens", "tokens_negative",
						"tokens must be a non-negative integer"))
				}
			}
		}
	}

	return ExtensionResult{Valid: len(errors) == 0, Errors: errors}
}
