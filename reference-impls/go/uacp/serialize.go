package uacp

import (
	"encoding/json"
	"fmt"
)

// Parse parses JSON bytes, validates, and returns a typed UACPDocument.
func Parse(data []byte) (*UACPDocument, error) {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("UACP parse failed: invalid JSON: %w", err)
	}

	result := Validate(raw)
	if !result.OK {
		return nil, fmt.Errorf("UACP parse failed:\n%s", joinErrors(result.Errors))
	}

	var doc UACPDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("UACP parse failed: %w", err)
	}
	return &doc, nil
}

// Serialize validates a UACPDocument and returns JSON bytes.
func Serialize(doc *UACPDocument) ([]byte, error) {
	data, err := json.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("UACP serialize failed: %w", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("UACP serialize failed: %w", err)
	}

	result := Validate(raw)
	if !result.OK {
		return nil, fmt.Errorf("UACP serialize failed: document is not valid:\n%s", joinErrors(result.Errors))
	}

	return data, nil
}

func joinErrors(errs []string) string {
	out := ""
	for i, e := range errs {
		if i > 0 {
			out += "\n"
		}
		out += e
	}
	return out
}
