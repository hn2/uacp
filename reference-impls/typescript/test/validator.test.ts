import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validate, parse, serialize } from '../src/index.js'
import type { UACPDocument } from '../src/index.js'

const minimal: UACPDocument = {
  uacp: '0.6.0',
  id: 'test-conv-id-001',
  tool: 'test-tool',
  messages: [{ role: 'user', content: 'Hello' }],
}

describe('validate', () => {
  it('accepts a minimal valid document', () => {
    const r = validate(minimal)
    assert.deepEqual(r, { ok: true })
  })

  it('rejects non-object input', () => {
    const r = validate('not an object')
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('Root must be')))
  })

  it('rejects missing uacp field', () => {
    const r = validate({ id: 'x', tool: 'y', messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('uacp')))
  })

  it('rejects invalid uacp semver', () => {
    const r = validate({ ...minimal, uacp: 'not-semver' })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('uacp')))
  })

  it('rejects missing id', () => {
    const { id: _, ...noId } = minimal
    const r = validate(noId)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('id')))
  })

  it('rejects missing tool', () => {
    const { tool: _, ...noTool } = minimal
    const r = validate(noTool)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('tool')))
  })

  it('rejects missing messages', () => {
    const { messages: _, ...noMsgs } = minimal
    const r = validate(noMsgs)
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('messages')))
  })

  it('rejects empty messages array', () => {
    const r = validate({ ...minimal, messages: [] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('messages')))
  })

  it('rejects invalid message role', () => {
    const r = validate({ ...minimal, messages: [{ role: 'bot', content: 'hi' }] })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('role')))
  })

  it('rejects invalid privacy value', () => {
    const r = validate({ ...minimal, privacy: 'unknown' })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('privacy')))
  })

  it('accepts valid privacy values', () => {
    for (const privacy of ['private', 'personal', 'team', 'public'] as const) {
      const r = validate({ ...minimal, privacy })
      assert.equal(r.ok, true, `privacy=${privacy} should be valid`)
    }
  })

  it('validates content blocks', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'thinking', text: 'reasoning...' },
          { type: 'code', code: 'console.log("hi")', language: 'javascript' },
        ],
      }],
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects invalid content block type', () => {
    const r = validate({
      ...minimal,
      messages: [{ role: 'user', content: [{ type: 'unknown-type' }] }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('type')))
  })

  it('validates citations with span and source.url', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: 'Source: ...',
        citations: [{ span: [0, 6], source: { url: 'https://example.com' } }],
      }],
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects citation without source.url', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: 'text',
        citations: [{ span: [0, 1], source: {} }],
      }],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('source.url')))
  })

  it('validates artifacts', () => {
    const r = validate({
      ...minimal,
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the code' },
          { type: 'artifact_ref', id: 'art-1' },
        ],
        artifacts: [{ id: 'art-1', type: 'code', title: 'example.ts', content: 'const x = 1' }],
      }],
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects extensions array over 32 items', () => {
    const extensions = Array.from({ length: 33 }, (_, i) => ({ id: `ext-${i}` }))
    const r = validate({ ...minimal, extensions })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('extensions')))
  })

  it('accepts exactly 32 extensions', () => {
    const extensions = Array.from({ length: 32 }, (_, i) => ({ id: `ext-${i}` }))
    const r = validate({ ...minimal, extensions })
    assert.equal(r.ok, true)
  })

  it('validates ISO 8601 timestamps', () => {
    const r = validate({
      ...minimal,
      created_at: '2026-05-09T12:00:00Z',
      updated_at: '2026-05-09T12:00:01.000Z',
    })
    assert.deepEqual(r, { ok: true })
  })

  it('rejects non-ISO timestamps', () => {
    const r = validate({ ...minimal, created_at: 'not-a-date' })
    assert.equal(r.ok, false)
    assert.ok(r.errors!.some(e => e.includes('created_at')))
  })
})

describe('parse', () => {
  it('parses a valid JSON string', () => {
    const doc = parse(JSON.stringify(minimal))
    assert.equal(doc.id, minimal.id)
    assert.equal(doc.tool, minimal.tool)
  })

  it('parses a plain object', () => {
    const doc = parse(minimal)
    assert.equal(doc.uacp, '0.6.0')
  })

  it('throws on invalid document', () => {
    assert.throws(() => parse({ uacp: 'bad', id: '', tool: '', messages: [] }), /UACP parse failed/)
  })
})

describe('serialize', () => {
  it('serializes a valid document to JSON string', () => {
    const json = serialize(minimal)
    const parsed = JSON.parse(json)
    assert.equal(parsed.id, minimal.id)
    assert.equal(parsed.uacp, '0.6.0')
  })

  it('throws on invalid document', () => {
    const bad = { ...minimal, messages: [] } as unknown as UACPDocument
    assert.throws(() => serialize(bad), /UACP serialize failed/)
  })

  it('parse → serialize round-trips cleanly', () => {
    const complex: UACPDocument = {
      uacp: '0.6.0',
      id: 'round-trip-001',
      tool: 'test',
      title: 'Round-trip test',
      privacy: 'personal',
      created_at: '2026-05-09T00:00:00Z',
      messages: [
        { role: 'user', content: 'Write a bubble sort function' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Here it is:' },
            { type: 'code', code: 'function bubbleSort(arr) { ... }', language: 'javascript' },
          ],
        },
      ],
      metadata: { session: 'abc123' },
    }
    const json = serialize(complex)
    const back = parse(json)
    assert.equal(back.id, complex.id)
    assert.equal(back.title, complex.title)
    assert.equal(back.messages.length, 2)
  })
})
