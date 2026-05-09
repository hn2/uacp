import type { UACPDocument, ValidationResult } from './types.js'

const VALID_ROLES = new Set(['user', 'assistant', 'system', 'tool'])
const VALID_PRIVACY = new Set(['private', 'personal', 'team', 'public'])
const VALID_MSG_STATUS = new Set(['complete', 'in_progress', 'error'])
const VALID_CONTENT_TYPES = new Set([
  'text', 'image', 'file', 'code', 'thinking', 'artifact_ref', 'audio', 'video', 'pdf', 'latex',
])
const VALID_ARTIFACT_TYPES = new Set(['code', 'html', 'svg', 'markdown', 'react', 'text'])
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function validateMessage(msg: unknown, idx: number, errors: string[]): void {
  const p = `messages[${idx}]`
  if (!isObject(msg)) { errors.push(`${p}: must be an object`); return }
  if (!VALID_ROLES.has(msg.role as string)) {
    errors.push(`${p}.role: must be one of ${[...VALID_ROLES].join(', ')}`)
  }
  if (msg.content === undefined || msg.content === null) {
    errors.push(`${p}.content: required`)
  } else if (Array.isArray(msg.content)) {
    ;(msg.content as unknown[]).forEach((block, j) => validateContentBlock(block, `${p}.content[${j}]`, errors))
  } else if (typeof msg.content !== 'string') {
    errors.push(`${p}.content: must be a string or array of content blocks`)
  }
  if (msg.status !== undefined && !VALID_MSG_STATUS.has(msg.status as string)) {
    errors.push(`${p}.status: must be one of ${[...VALID_MSG_STATUS].join(', ')}`)
  }
  if (msg.timestamp !== undefined && !ISO8601_RE.test(msg.timestamp as string)) {
    errors.push(`${p}.timestamp: must be an ISO 8601 datetime string`)
  }
  if (msg.citations !== undefined) {
    if (!Array.isArray(msg.citations)) {
      errors.push(`${p}.citations: must be an array`)
    } else {
      ;(msg.citations as unknown[]).forEach((c, j) => validateCitation(c, `${p}.citations[${j}]`, errors))
    }
  }
  if (msg.artifacts !== undefined) {
    if (!Array.isArray(msg.artifacts)) {
      errors.push(`${p}.artifacts: must be an array`)
    } else {
      ;(msg.artifacts as unknown[]).forEach((a, j) => validateArtifact(a, `${p}.artifacts[${j}]`, errors))
    }
  }
}

function validateContentBlock(block: unknown, prefix: string, errors: string[]): void {
  if (!isObject(block)) { errors.push(`${prefix}: must be an object`); return }
  if (!block.type || !VALID_CONTENT_TYPES.has(block.type as string)) {
    errors.push(`${prefix}.type: must be one of ${[...VALID_CONTENT_TYPES].join(', ')}`)
  }
  if (block.type === 'thinking' && typeof block.text !== 'string') {
    errors.push(`${prefix}: thinking block requires text (string)`)
  }
  if (block.type === 'artifact_ref' && typeof block.id !== 'string') {
    errors.push(`${prefix}: artifact_ref block requires id (string)`)
  }
  if (block.type === 'code' && typeof block.code !== 'string') {
    errors.push(`${prefix}: code block requires code (string)`)
  }
  if (block.type === 'latex' && typeof block.text !== 'string') {
    errors.push(`${prefix}: latex block requires text (string)`)
  }
}

function validateCitation(c: unknown, prefix: string, errors: string[]): void {
  if (!isObject(c)) { errors.push(`${prefix}: must be an object`); return }
  if (!Array.isArray(c.span) || c.span.length !== 2 || (c.span as unknown[]).some(v => typeof v !== 'number')) {
    errors.push(`${prefix}.span: must be [number, number]`)
  }
  if (!isObject(c.source) || typeof (c.source as Record<string, unknown>).url !== 'string') {
    errors.push(`${prefix}.source.url: required`)
  }
}

function validateArtifact(a: unknown, prefix: string, errors: string[]): void {
  if (!isObject(a)) { errors.push(`${prefix}: must be an object`); return }
  if (typeof a.id !== 'string' || !a.id) errors.push(`${prefix}.id: required`)
  if (!VALID_ARTIFACT_TYPES.has(a.type as string)) {
    errors.push(`${prefix}.type: must be one of ${[...VALID_ARTIFACT_TYPES].join(', ')}`)
  }
  if (typeof a.title !== 'string' || !a.title) errors.push(`${prefix}.title: required`)
  if (typeof a.content !== 'string') errors.push(`${prefix}.content: required (string)`)
}

export function validate(doc: unknown): ValidationResult {
  const errors: string[] = []

  if (!isObject(doc)) {
    return { ok: false, errors: ['Root must be a JSON object'] }
  }

  if (!doc.uacp || typeof doc.uacp !== 'string' || !SEMVER_RE.test(doc.uacp as string)) {
    errors.push('uacp: must be a semver string (e.g. "0.6.0")')
  }

  if (!doc.id || typeof doc.id !== 'string' || !(doc.id as string).trim()) {
    errors.push('id: required, must be a non-empty string')
  }

  if (!doc.tool || typeof doc.tool !== 'string') {
    errors.push('tool: required, must be a string')
  }

  if (!Array.isArray(doc.messages)) {
    errors.push('messages: required, must be an array')
  } else if ((doc.messages as unknown[]).length === 0) {
    errors.push('messages: must contain at least one message')
  } else {
    ;(doc.messages as unknown[]).forEach((msg, i) => validateMessage(msg, i, errors))
  }

  if (doc.privacy !== undefined && !VALID_PRIVACY.has(doc.privacy as string)) {
    errors.push(`privacy: must be one of ${[...VALID_PRIVACY].join(', ')}`)
  }

  if (doc.created_at !== undefined && !ISO8601_RE.test(doc.created_at as string)) {
    errors.push('created_at: must be an ISO 8601 datetime string')
  }

  if (doc.updated_at !== undefined && !ISO8601_RE.test(doc.updated_at as string)) {
    errors.push('updated_at: must be an ISO 8601 datetime string')
  }

  if (doc.branches !== undefined && !Array.isArray(doc.branches)) {
    errors.push('branches: must be an array of strings')
  }

  if (doc.extensions !== undefined) {
    if (!Array.isArray(doc.extensions)) {
      errors.push('extensions: must be an array')
    } else if ((doc.extensions as unknown[]).length > 32) {
      errors.push('extensions: must not contain more than 32 items')
    } else {
      ;(doc.extensions as unknown[]).forEach((ext, i) => {
        if (!isObject(ext) || typeof (ext as Record<string, unknown>).id !== 'string') {
          errors.push(`extensions[${i}].id: required`)
        }
      })
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
