import type { UACPDocument } from '../types.js'

const VALID_VISIBILITY = new Set(['visible', 'hidden', 'redacted'])
const MAX_THINKING_TEXT = 1_000_000

export interface ReasoningValidationError {
  path: string
  code: string
  message: string
}

function err(path: string, code: string, message: string): ReasoningValidationError {
  return { path, code, message }
}

function codepointLength(s: string): number {
  let count = 0
  for (const _ of s) count++
  return count
}

export function validateReasoning(doc: UACPDocument): { valid: boolean; errors: ReasoningValidationError[] } {
  const errors: ReasoningValidationError[] = []
  const messages = doc.messages ?? []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { content?: unknown }
    const content = m.content
    if (!Array.isArray(content)) continue

    for (let j = 0; j < content.length; j++) {
      const block = content[j] as Record<string, unknown> | undefined
      if (!block || block.type !== 'thinking') continue
      const path = `messages[${i}].content[${j}]`

      const text = block.text
      if (typeof text !== 'string') {
        errors.push(err(`${path}.text`, 'thinking_missing_text', 'thinking block must have a text field of type string'))
      } else if (codepointLength(text) > MAX_THINKING_TEXT) {
        errors.push(err(`${path}.text`, 'thinking_text_too_long', `thinking text must be at most ${MAX_THINKING_TEXT} Unicode codepoints`))
      }

      const vis = block.model_visibility
      if (vis !== undefined) {
        if (typeof vis !== 'string' || !VALID_VISIBILITY.has(vis)) {
          errors.push(err(`${path}.model_visibility`, 'model_visibility_invalid', `model_visibility must be one of: visible, hidden, redacted`))
        }
      }

      const tokens = block.tokens
      if (tokens !== undefined) {
        if (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens < 0) {
          errors.push(err(`${path}.tokens`, 'tokens_negative', 'tokens must be a non-negative integer'))
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
