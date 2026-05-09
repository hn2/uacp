import type { UACPDocument } from '../types.js'

export interface ArtifactsValidationError {
  path: string
  code: string
  message: string
}

function err(path: string, code: string, message: string): ArtifactsValidationError {
  return { path, code, message }
}

interface ArtifactRef {
  artifact: Record<string, unknown>
  path: string
}

export function validateArtifacts(doc: UACPDocument): { valid: boolean; errors: ArtifactsValidationError[] } {
  const errors: ArtifactsValidationError[] = []
  const messages = doc.messages ?? []

  // Index every artifact in the conversation by its id.
  const byId = new Map<string, ArtifactRef>()
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { artifacts?: unknown }
    const artifacts = m.artifacts
    if (!Array.isArray(artifacts)) continue
    for (let j = 0; j < artifacts.length; j++) {
      const a = artifacts[j]
      if (!a || typeof a !== 'object') continue
      const id = (a as Record<string, unknown>).id
      if (typeof id === 'string' && id) {
        byId.set(id, { artifact: a as Record<string, unknown>, path: `messages[${i}].artifacts[${j}]` })
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { artifacts?: unknown }
    const artifacts = m.artifacts
    if (!Array.isArray(artifacts)) continue
    for (let j = 0; j < artifacts.length; j++) {
      const a = artifacts[j] as Record<string, unknown> | undefined
      if (!a) continue
      const path = `messages[${i}].artifacts[${j}]`

      const lineageId = a.artifact_lineage_id
      const prevId = a.previous_version_id
      const version = a.version
      const immutable = a.immutable

      // version validation (only when extension fields used)
      const usingExt = lineageId !== undefined || prevId !== undefined || immutable !== undefined
      if (usingExt) {
        if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
          errors.push(err(`${path}.version`, 'version_invalid', 'version must be an integer >= 1'))
        }
        if (lineageId !== undefined && (typeof lineageId !== 'string' || !lineageId || lineageId.length > 256)) {
          errors.push(err(`${path}.artifact_lineage_id`, 'lineage_id_invalid', 'artifact_lineage_id must be a non-empty string of at most 256 characters'))
        }
        if (immutable !== undefined && typeof immutable !== 'boolean') {
          errors.push(err(`${path}.immutable`, 'immutable_invalid', 'immutable must be a boolean'))
        }

        if (typeof version === 'number' && version === 1) {
          if (prevId !== undefined) {
            errors.push(err(`${path}.previous_version_id`, 'previous_version_id_on_v1', 'previous_version_id must be absent for version 1'))
          }
        } else if (typeof version === 'number' && version > 1) {
          if (prevId === undefined) {
            errors.push(err(`${path}.previous_version_id`, 'previous_version_id_missing', `previous_version_id is required when version > 1`))
          } else if (typeof prevId !== 'string' || !prevId) {
            errors.push(err(`${path}.previous_version_id`, 'previous_version_id_invalid', 'previous_version_id must be a non-empty string'))
          } else {
            const prev = byId.get(prevId)
            if (!prev) {
              errors.push(err(`${path}.previous_version_id`, 'previous_version_id_dangling', `previous_version_id '${prevId}' does not match any artifact in the conversation`))
            } else {
              const prevVersion = prev.artifact.version
              const prevLineage = prev.artifact.artifact_lineage_id
              if (typeof prevLineage === 'string' && typeof lineageId === 'string' && prevLineage !== lineageId) {
                errors.push(err(`${path}.artifact_lineage_id`, 'lineage_id_mismatch', `artifact_lineage_id '${lineageId}' does not match previous version's lineage '${prevLineage}'`))
              }
              if (typeof prevVersion === 'number' && typeof version === 'number' && version !== prevVersion + 1) {
                errors.push(err(`${path}.version`, 'version_not_monotonic', `version must equal previous version + 1 (expected ${prevVersion + 1}, got ${version})`))
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
