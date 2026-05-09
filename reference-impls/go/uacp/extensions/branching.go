package extensions

import "fmt"

const maxBranchLabel = 256

// ExtensionError describes a single validation error returned by an extension validator.
type ExtensionError struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ExtensionResult is the standard return shape for an extension validator.
type ExtensionResult struct {
	Valid  bool             `json:"valid"`
	Errors []ExtensionError `json:"errors"`
}

func extErr(path, code, message string) ExtensionError {
	return ExtensionError{Path: path, Code: code, Message: message}
}

// ValidateBranching enforces the uacp-branching extension rules:
// branch_parent_id MUST reference an existing message id, MUST NOT equal the
// message's own id, MUST NOT introduce a cycle, and branch_label MUST be at
// most 256 characters.
func ValidateBranching(doc map[string]any) ExtensionResult {
	errors := []ExtensionError{}
	messagesRaw, _ := doc["messages"].([]any)

	idIndex := map[string]int{}
	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		if id, ok := m["id"].(string); ok && id != "" {
			idIndex[id] = i
		}
	}

	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		path := fmt.Sprintf("messages[%d]", i)

		if label, ok := m["branch_label"].(string); ok && len(label) > maxBranchLabel {
			errors = append(errors, extErr(path+".branch_label", "branch_label_too_long",
				fmt.Sprintf("branch_label must be at most %d characters", maxBranchLabel)))
		}

		parentRaw, exists := m["branch_parent_id"]
		if !exists {
			continue
		}
		parent, ok := parentRaw.(string)
		if !ok || parent == "" {
			errors = append(errors, extErr(path+".branch_parent_id", "branch_parent_id_invalid",
				"branch_parent_id must be a non-empty string"))
			continue
		}

		if id, ok := m["id"].(string); ok && parent == id {
			errors = append(errors, extErr(path+".branch_parent_id", "branch_parent_id_self_reference",
				"branch_parent_id must not equal the message id"))
			continue
		}

		if _, found := idIndex[parent]; !found {
			errors = append(errors, extErr(path+".branch_parent_id", "branch_parent_id_dangling",
				fmt.Sprintf("branch_parent_id '%s' does not match any message id in the conversation", parent)))
			continue
		}
	}

	// Cycle detection
	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		parent, hasParent := m["branch_parent_id"].(string)
		id, hasID := m["id"].(string)
		if !hasParent || !hasID || parent == "" || id == "" {
			continue
		}
		visited := map[string]bool{}
		current := parent
		for current != "" {
			if visited[current] {
				break
			}
			if current == id {
				errors = append(errors, extErr(fmt.Sprintf("messages[%d].branch_parent_id", i), "branch_parent_id_cycle",
					fmt.Sprintf("branch_parent_id chain forms a cycle through message '%s'", id)))
				break
			}
			visited[current] = true
			parentIdx, ok := idIndex[current]
			if !ok {
				break
			}
			parentMsg, ok := messagesRaw[parentIdx].(map[string]any)
			if !ok {
				break
			}
			next, _ := parentMsg["branch_parent_id"].(string)
			current = next
		}
	}

	return ExtensionResult{Valid: len(errors) == 0, Errors: errors}
}
