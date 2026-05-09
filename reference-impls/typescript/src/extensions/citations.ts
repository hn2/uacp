import type { UACPDocument } from '../types.js'

const VALID_KINDS = new Set(['web', 'document', 'vector_store', 'tool_result', 'user_attachment'])
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export interface CitationValidationError {
  path: string
  code: string
  message: string
}

function err(path: string, code: string, message: string): CitationValidationError {
  return { path, code, message }
}

function codepointLength(s: string): number {
  let count = 0
  for (const _ of s) count++
  return count
}

function flattenedTextLength(content: unknown): number {
  if (typeof content === 'string') return codepointLength(content)
  if (!Array.isArray(content)) return 0
  let n = 0
  for (const block of content) {
    if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text') {
      const t = (block as Record<string, unknown>).text
      if (typeof t === 'string') n += codepointLength(t)
    }
  }
  return n
}

function validateAnchor(anchor: unknown, path: string, errors: CitationValidationError[], textLen: number): void {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
    errors.push(err(path, 'anchor_invalid', 'anchor must be an object'))
    return
  }
  const a = anchor as Record<string, unknown>
  const hasStartEnd = a.start !== undefined || a.end !== undefined
  const hasSelector = a.selector !== undefined
  const hasPage = a.page !== undefined

  const branches = [hasStartEnd, hasSelector, hasPage].filter(Boolean).length
  if (branches === 0) {
    errors.push(err(path, 'anchor_no_branch_matched', 'anchor must have one of: (start+end), selector, or page'))
    return
  }
  if (branches > 1) {
    errors.push(err(path, 'anchor_multiple_branches', 'anchor must have exactly one of: (start+end), selector, or page'))
    return
  }

  if (hasStartEnd) {
    const start = a.start
    const end = a.end
    if (typeof start !== 'number' || !Number.isInteger(start) || start < 0) {
      errors.push(err(`${path}.start`, 'anchor_start_invalid', 'start must be a non-negative integer'))
    }
    if (typeof end !== 'number' || !Number.isInteger(end) || end < 0) {
      errors.push(err(`${path}.end`, 'anchor_end_invalid', 'end must be a non-negative integer'))
    }
    if (typeof start === 'number' && typeof end === 'number' && end < start) {
      errors.push(err(path, 'anchor_end_before_start', 'anchor.end must be greater than or equal to anchor.start'))
    }
    if (typeof end === 'number' && textLen > 0 && end > textLen) {
      errors.push(err(path, 'anchor_out_of_range', `anchor.end (${end}) is past the end of message text (length ${textLen} codepoints)`))
    }
    if (typeof start === 'number' && textLen > 0 && start > textLen) {
      errors.push(err(path, 'anchor_out_of_range', `anchor.start (${start}) is past the end of message text (length ${textLen} codepoints)`))
    }
  }
  if (hasSelector) {
    if (typeof a.selector !== 'string' || !a.selector) {
      errors.push(err(`${path}.selector`, 'anchor_selector_invalid', 'selector must be a non-empty string'))
    }
  }
  if (hasPage) {
    if (typeof a.page !== 'number' || !Number.isInteger(a.page) || a.page < 1) {
      errors.push(err(`${path}.page`, 'anchor_page_invalid', 'page must be an integer >= 1'))
    }
  }
}

export function validateCitations(doc: UACPDocument): { valid: boolean; errors: CitationValidationError[] } {
  const errors: CitationValidationError[] = []
  const messages = doc.messages ?? []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as unknown as { content?: unknown; citations?: unknown }
    const citations = m.citations
    if (!Array.isArray(citations)) continue

    const textLen = flattenedTextLength(m.content)

    for (let j = 0; j < citations.length; j++) {
      const c = citations[j] as Record<string, unknown> | undefined
      const path = `messages[${i}].citations[${j}]`
      if (!c || typeof c !== 'object') {
        errors.push(err(path, 'citation_invalid', 'citation must be an object'))
        continue
      }

      // Skip core-form citations (with span+source.url and no kind/anchor) — the extension is layered on the new form.
      const hasNewForm = c.anchor !== undefined || (c.source && typeof c.source === 'object' && (c.source as Record<string, unknown>).kind !== undefined)
      if (!hasNewForm) continue

      const source = c.source
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        errors.push(err(`${path}.source`, 'source_invalid', 'source must be an object'))
        continue
      }
      const kind = (source as Record<string, unknown>).kind
      if (typeof kind !== 'string' || !VALID_KINDS.has(kind)) {
        errors.push(err(`${path}.source.kind`, 'source_kind_invalid', `source.kind must be one of: ${[...VALID_KINDS].join(', ')}`))
      }

      const retrievedAt = c.retrieved_at
      if (kind === 'web' && retrievedAt === undefined) {
        errors.push(err(`${path}.retrieved_at`, 'web_missing_retrieved_at', 'retrieved_at is required when source.kind is "web"'))
      }
      if (retrievedAt !== undefined) {
        if (typeof retrievedAt !== 'string' || !RFC3339_RE.test(retrievedAt)) {
          errors.push(err(`${path}.retrieved_at`, 'retrieved_at_invalid', 'retrieved_at must be an RFC 3339 / ISO 8601 datetime string'))
        }
      }

      const confidence = c.confidence
      if (confidence !== undefined) {
        if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
          errors.push(err(`${path}.confidence`, 'confidence_invalid', 'confidence must be a number between 0 and 1'))
        }
      }

      if (c.anchor === undefined) {
        errors.push(err(`${path}.anchor`, 'anchor_missing', 'anchor is required'))
      } else {
        validateAnchor(c.anchor, `${path}.anchor`, errors, textLen)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
