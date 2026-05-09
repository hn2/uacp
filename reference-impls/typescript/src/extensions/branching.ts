import type { UACPDocument, ValidationResult } from '../types.js'

const MAX_LABEL = 256

export interface BranchingValidationError {
  path: string
  code: string
  message: string
}

function err(path: string, code: string, message: string): BranchingValidationError {
  return { path, code, message }
}

export function validateBranching(doc: UACPDocument): { valid: boolean; errors: BranchingValidationError[] } {
  const errors: BranchingValidationError[] = []
  const messages = doc.messages ?? []

  const idIndex = new Map<string, number>()
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { id?: string }
    if (typeof m.id === 'string' && m.id) {
      idIndex.set(m.id, i)
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { id?: string; branch_parent_id?: string; branch_label?: string }
    const path = `messages[${i}]`

    if (m.branch_label !== undefined && typeof m.branch_label === 'string' && m.branch_label.length > MAX_LABEL) {
      errors.push(err(`${path}.branch_label`, 'branch_label_too_long', `branch_label must be at most ${MAX_LABEL} characters`))
    }

    if (m.branch_parent_id === undefined) continue

    if (typeof m.branch_parent_id !== 'string' || !m.branch_parent_id) {
      errors.push(err(`${path}.branch_parent_id`, 'branch_parent_id_invalid', 'branch_parent_id must be a non-empty string'))
      continue
    }

    if (m.id && m.branch_parent_id === m.id) {
      errors.push(err(`${path}.branch_parent_id`, 'branch_parent_id_self_reference', 'branch_parent_id must not equal the message id'))
      continue
    }

    if (!idIndex.has(m.branch_parent_id)) {
      errors.push(err(`${path}.branch_parent_id`, 'branch_parent_id_dangling', `branch_parent_id '${m.branch_parent_id}' does not match any message id in the conversation`))
      continue
    }
  }

  // Cycle detection — DFS over branch_parent_id pointers
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { id?: string; branch_parent_id?: string }
    if (!m.branch_parent_id || !m.id) continue

    const visited = new Set<string>()
    let current: string | undefined = m.branch_parent_id
    while (current) {
      if (visited.has(current)) break
      if (current === m.id) {
        errors.push(err(`messages[${i}].branch_parent_id`, 'branch_parent_id_cycle', `branch_parent_id chain forms a cycle through message '${m.id}'`))
        break
      }
      visited.add(current)
      const parentIdx = idIndex.get(current)
      if (parentIdx === undefined) break
      const parent = messages[parentIdx] as unknown as { branch_parent_id?: string }
      current = parent.branch_parent_id
    }
  }

  return { valid: errors.length === 0, errors }
}

export function toValidationResult(r: { valid: boolean; errors: BranchingValidationError[] }): ValidationResult {
  if (r.valid) return { ok: true }
  return { ok: false, errors: r.errors.map(e => `${e.path}: ${e.message} [${e.code}]`) }
}
