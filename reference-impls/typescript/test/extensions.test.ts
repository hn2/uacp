import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBranching } from '../src/extensions/branching.js'
import { validateReasoning } from '../src/extensions/reasoning.js'
import { validateCitations } from '../src/extensions/citations.js'
import { validateArtifacts } from '../src/extensions/artifacts.js'
import type { UACPDocument } from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXT_VECTORS_DIR = join(__dirname, '../../../../test-vectors/extensions')

const minimal: UACPDocument = {
  uacp: '0.6.0',
  id: 'test-id',
  tool: 't',
  messages: [{ role: 'user', content: 'hi' }],
}

describe('uacp-branching validator', () => {
  it('accepts a simple branch', () => {
    const r = validateBranching({
      ...minimal,
      messages: [
        { id: 'm1', role: 'user', content: 'a' },
        { id: 'm2', role: 'assistant', content: 'b' },
        { id: 'm3', role: 'user', content: 'a2', branch_parent_id: 'm1', branch_label: 'edit' },
      ],
    } as UACPDocument)
    assert.equal(r.valid, true, JSON.stringify(r.errors))
  })

  it('rejects dangling branch_parent_id', () => {
    const r = validateBranching({
      ...minimal,
      messages: [
        { id: 'm1', role: 'user', content: 'a' },
        { id: 'm2', role: 'assistant', content: 'b', branch_parent_id: 'ghost' },
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'branch_parent_id_dangling'))
  })

  it('rejects self-reference', () => {
    const r = validateBranching({
      ...minimal,
      messages: [
        { id: 'm1', role: 'user', content: 'a' },
        { id: 'm2', role: 'assistant', content: 'b', branch_parent_id: 'm2' },
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'branch_parent_id_self_reference'))
  })

  it('rejects cycle (m1 -> m2 -> m1)', () => {
    const r = validateBranching({
      ...minimal,
      messages: [
        { id: 'm1', role: 'user', content: 'a', branch_parent_id: 'm2' },
        { id: 'm2', role: 'assistant', content: 'b', branch_parent_id: 'm1' },
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'branch_parent_id_cycle'))
  })

  it('rejects branch_label longer than 256 chars', () => {
    const r = validateBranching({
      ...minimal,
      messages: [
        { id: 'm1', role: 'user', content: 'a' },
        { id: 'm2', role: 'assistant', content: 'b', branch_label: 'X'.repeat(257) },
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'branch_label_too_long'))
  })
})

describe('uacp-reasoning validator', () => {
  it('accepts a thinking content block with model_visibility=visible', () => {
    const r = validateReasoning({
      ...minimal,
      messages: [
        { role: 'assistant', content: [
          { type: 'thinking', text: 'reasoning', model_visibility: 'visible', tokens: 5 },
          { type: 'text', text: 'answer' },
        ]},
      ],
    } as UACPDocument)
    assert.equal(r.valid, true, JSON.stringify(r.errors))
  })

  it('accepts redacted reasoning', () => {
    const r = validateReasoning({
      ...minimal,
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', text: '[redacted]', model_visibility: 'redacted' }]},
      ],
    } as UACPDocument)
    assert.equal(r.valid, true)
  })

  it('rejects thinking block missing text', () => {
    const r = validateReasoning({
      ...minimal,
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', model_visibility: 'hidden' } as unknown as { type: 'thinking'; text: string }]},
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'thinking_missing_text'))
  })

  it('rejects invalid model_visibility', () => {
    const r = validateReasoning({
      ...minimal,
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', text: 'r', model_visibility: 'public' as 'visible' }]},
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'model_visibility_invalid'))
  })

  it('rejects negative tokens', () => {
    const r = validateReasoning({
      ...minimal,
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', text: 'r', tokens: -1 } as unknown as { type: 'thinking'; text: string }]},
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'tokens_negative'))
  })

  it('rejects text exceeding 1_000_000 codepoints', () => {
    const r = validateReasoning({
      ...minimal,
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', text: 'a'.repeat(1_000_001) }]},
      ],
    } as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'thinking_text_too_long'))
  })
})

describe('uacp-citations validator', () => {
  it('accepts web citation with retrieved_at + start/end anchor', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'The sky is blue.', citations: [{
          source: { kind: 'web', url: 'https://example.com/a' },
          retrieved_at: '2026-05-09T12:00:00Z',
          anchor: { start: 0, end: 16 },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, true, JSON.stringify(r.errors))
  })

  it('accepts document citation with page anchor', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'See doc.', citations: [{
          source: { kind: 'document', title: 'Manual', id: 'doc-123' },
          anchor: { page: 42 },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, true)
  })

  it('accepts citation with selector anchor', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'See selector.', citations: [{
          source: { kind: 'tool_result', id: 'tool-1' },
          anchor: { selector: '#section-2 > p:nth-child(3)' },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, true)
  })

  it('rejects web citation missing retrieved_at', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', citations: [{
          source: { kind: 'web', url: 'https://example.com' },
          anchor: { start: 0, end: 1 },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'web_missing_retrieved_at'))
  })

  it('rejects anchor with end < start', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'hello', citations: [{
          source: { kind: 'document' },
          anchor: { start: 5, end: 1 },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'anchor_end_before_start'))
  })

  it('rejects anchor with no oneOf branch matched', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'hi', citations: [{
          source: { kind: 'document' },
          anchor: {},
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'anchor_no_branch_matched'))
  })

  it('rejects retrieved_at not RFC3339', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', citations: [{
          source: { kind: 'web', url: 'https://example.com' },
          retrieved_at: 'yesterday',
          anchor: { start: 0, end: 1 },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'retrieved_at_invalid'))
  })

  it('rejects codepoint offset past end of text', () => {
    const r = validateCitations({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'short', citations: [{
          source: { kind: 'document' },
          anchor: { start: 100, end: 200 },
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'anchor_out_of_range'))
  })
})

describe('uacp-artifacts validator', () => {
  it('accepts version 1 with no previous_version_id', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a1', type: 'code', title: 't', content: 'c',
          version: 1, artifact_lineage_id: 'lin-1',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, true, JSON.stringify(r.errors))
  })

  it('accepts a chain of versions in same lineage', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a1', type: 'code', title: 't', content: 'v1',
          version: 1, artifact_lineage_id: 'lin-1',
        }]},
        { role: 'user', content: 'edit' },
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a2', type: 'code', title: 't', content: 'v2',
          version: 2, artifact_lineage_id: 'lin-1', previous_version_id: 'a1',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, true, JSON.stringify(r.errors))
  })

  it('rejects v2 missing previous_version_id', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a1', type: 'code', title: 't', content: 'v1',
          version: 1, artifact_lineage_id: 'lin-1',
        }]},
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a2', type: 'code', title: 't', content: 'v2',
          version: 2, artifact_lineage_id: 'lin-1',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'previous_version_id_missing'))
  })

  it('rejects version 0', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a1', type: 'code', title: 't', content: 'c',
          version: 0, artifact_lineage_id: 'lin-1',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'version_invalid'))
  })

  it('rejects dangling previous_version_id', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a2', type: 'code', title: 't', content: 'v2',
          version: 2, artifact_lineage_id: 'lin-1', previous_version_id: 'ghost',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'previous_version_id_dangling'))
  })

  it('rejects lineage_id mismatch within chain', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a1', type: 'code', title: 't', content: 'v1',
          version: 1, artifact_lineage_id: 'lin-1',
        }]},
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a2', type: 'code', title: 't', content: 'v2',
          version: 2, artifact_lineage_id: 'lin-OTHER', previous_version_id: 'a1',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'lineage_id_mismatch'))
  })

  it('rejects skipped version numbers (1, 3 without 2)', () => {
    const r = validateArtifacts({
      ...minimal,
      messages: [
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a1', type: 'code', title: 't', content: 'v1',
          version: 1, artifact_lineage_id: 'lin-1',
        }]},
        { role: 'assistant', content: 'x', artifacts: [{
          id: 'a3', type: 'code', title: 't', content: 'v3',
          version: 3, artifact_lineage_id: 'lin-1', previous_version_id: 'a1',
        }]},
      ],
    } as unknown as UACPDocument)
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.code === 'version_not_monotonic'))
  })
})

describe('extension test vectors — branching', () => {
  const dir = join(EXT_VECTORS_DIR, 'branching')
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    const expectInvalid = doc?.metadata?.['uacp.test.expect'] === 'invalid'
    if (expectInvalid) {
      it(`rejects ${f}`, () => {
        const r = validateBranching(doc as UACPDocument)
        assert.equal(r.valid, false, `expected invalid: ${f}`)
      })
    } else {
      it(`accepts ${f}`, () => {
        const r = validateBranching(doc as UACPDocument)
        assert.equal(r.valid, true, `expected valid: ${f}, errors=${JSON.stringify(r.errors)}`)
      })
    }
  }
})

describe('extension test vectors — reasoning', () => {
  const dir = join(EXT_VECTORS_DIR, 'reasoning')
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    const expectInvalid = doc?.metadata?.['uacp.test.expect'] === 'invalid'
    if (expectInvalid) {
      it(`rejects ${f}`, () => {
        const r = validateReasoning(doc as UACPDocument)
        assert.equal(r.valid, false, `expected invalid: ${f}`)
      })
    } else {
      it(`accepts ${f}`, () => {
        const r = validateReasoning(doc as UACPDocument)
        assert.equal(r.valid, true, `expected valid: ${f}, errors=${JSON.stringify(r.errors)}`)
      })
    }
  }
})

describe('extension test vectors — citations', () => {
  const dir = join(EXT_VECTORS_DIR, 'citations')
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    const expectInvalid = doc?.metadata?.['uacp.test.expect'] === 'invalid'
    if (expectInvalid) {
      it(`rejects ${f}`, () => {
        const r = validateCitations(doc as UACPDocument)
        assert.equal(r.valid, false, `expected invalid: ${f}`)
      })
    } else {
      it(`accepts ${f}`, () => {
        const r = validateCitations(doc as UACPDocument)
        assert.equal(r.valid, true, `expected valid: ${f}, errors=${JSON.stringify(r.errors)}`)
      })
    }
  }
})

describe('extension test vectors — artifacts', () => {
  const dir = join(EXT_VECTORS_DIR, 'artifacts')
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    const expectInvalid = doc?.metadata?.['uacp.test.expect'] === 'invalid'
    if (expectInvalid) {
      it(`rejects ${f}`, () => {
        const r = validateArtifacts(doc as UACPDocument)
        assert.equal(r.valid, false, `expected invalid: ${f}`)
      })
    } else {
      it(`accepts ${f}`, () => {
        const r = validateArtifacts(doc as UACPDocument)
        assert.equal(r.valid, true, `expected valid: ${f}, errors=${JSON.stringify(r.errors)}`)
      })
    }
  }
})
