package extensions

import "fmt"

type artifactRef struct {
	artifact map[string]any
	path     string
}

// ValidateArtifacts enforces the uacp-artifacts extension version-chain rules.
func ValidateArtifacts(doc map[string]any) ExtensionResult {
	errors := []ExtensionError{}
	messagesRaw, _ := doc["messages"].([]any)

	byID := map[string]artifactRef{}
	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		artifacts, ok := m["artifacts"].([]any)
		if !ok {
			continue
		}
		for j, aRaw := range artifacts {
			a, ok := aRaw.(map[string]any)
			if !ok {
				continue
			}
			if id, ok := a["id"].(string); ok && id != "" {
				byID[id] = artifactRef{artifact: a, path: fmt.Sprintf("messages[%d].artifacts[%d]", i, j)}
			}
		}
	}

	for i, mRaw := range messagesRaw {
		m, ok := mRaw.(map[string]any)
		if !ok {
			continue
		}
		artifacts, ok := m["artifacts"].([]any)
		if !ok {
			continue
		}
		for j, aRaw := range artifacts {
			a, ok := aRaw.(map[string]any)
			if !ok {
				continue
			}
			path := fmt.Sprintf("messages[%d].artifacts[%d]", i, j)

			_, hasLineage := a["artifact_lineage_id"]
			_, hasPrev := a["previous_version_id"]
			_, hasImmutable := a["immutable"]
			usingExt := hasLineage || hasPrev || hasImmutable
			if !usingExt {
				continue
			}

			lineageID, _ := a["artifact_lineage_id"].(string)
			prevID, _ := a["previous_version_id"].(string)
			versionRaw, hasVersion := a["version"]
			versionInt, versionOK := isInteger(versionRaw)

			if !hasVersion || !versionOK || versionInt < 1 {
				errors = append(errors, extErr(path+".version", "version_invalid",
					"version must be an integer >= 1"))
			}

			if hasLineage {
				if lineageID == "" || len(lineageID) > 256 {
					errors = append(errors, extErr(path+".artifact_lineage_id", "lineage_id_invalid",
						"artifact_lineage_id must be a non-empty string of at most 256 characters"))
				}
			}

			if hasImmutable {
				if _, ok := a["immutable"].(bool); !ok {
					errors = append(errors, extErr(path+".immutable", "immutable_invalid",
						"immutable must be a boolean"))
				}
			}

			if versionOK {
				if versionInt == 1 {
					if hasPrev {
						errors = append(errors, extErr(path+".previous_version_id", "previous_version_id_on_v1",
							"previous_version_id must be absent for version 1"))
					}
				} else if versionInt > 1 {
					if !hasPrev {
						errors = append(errors, extErr(path+".previous_version_id", "previous_version_id_missing",
							"previous_version_id is required when version > 1"))
					} else if prevID == "" {
						errors = append(errors, extErr(path+".previous_version_id", "previous_version_id_invalid",
							"previous_version_id must be a non-empty string"))
					} else {
						prev, found := byID[prevID]
						if !found {
							errors = append(errors, extErr(path+".previous_version_id", "previous_version_id_dangling",
								fmt.Sprintf("previous_version_id '%s' does not match any artifact in the conversation", prevID)))
						} else {
							prevLineage, _ := prev.artifact["artifact_lineage_id"].(string)
							if prevLineage != "" && lineageID != "" && prevLineage != lineageID {
								errors = append(errors, extErr(path+".artifact_lineage_id", "lineage_id_mismatch",
									fmt.Sprintf("artifact_lineage_id '%s' does not match previous version's lineage '%s'", lineageID, prevLineage)))
							}
							if pv, ok := isInteger(prev.artifact["version"]); ok {
								if versionInt != pv+1 {
									errors = append(errors, extErr(path+".version", "version_not_monotonic",
										fmt.Sprintf("version must equal previous version + 1 (expected %d, got %d)", pv+1, versionInt)))
								}
							}
						}
					}
				}
			}
		}
	}

	return ExtensionResult{Valid: len(errors) == 0, Errors: errors}
}
