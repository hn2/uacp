const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateMemoryLifecycle } = require('../lib/memory-lifecycle')

test('allows a legacy Memory v1 body', () => {
  assert.deepEqual(validateMemoryLifecycle({ content: 'I prefer dark mode.' }), [])
})

test('requires lineage for every non-initial revision', () => {
  assert.deepEqual(
    validateMemoryLifecycle({ content: 'I prefer dark mode.', lifecycle: { action: 'update', status: 'active', revision: 2 } }),
    ['MEMORY_LIFECYCLE_PREVIOUS_REVISION_REQUIRED'],
  )
})

test('requires explicit consent for sensitive memories', () => {
  assert.deepEqual(
    validateMemoryLifecycle({ content: 'I have a dietary preference.', category: 'health', lifecycle: { action: 'create', status: 'active', revision: 1 } }),
    ['MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT'],
  )
})

test('allows a rollback-as-new-revision with auditable lineage', () => {
  assert.deepEqual(
    validateMemoryLifecycle({
      content: 'I prefer dark mode.',
      lifecycle: {
        action: 'rollback',
        status: 'active',
        revision: 3,
        previous_revision: { memory_id: 'mem-1', revision: 2 },
      },
      derived_from: [{ memory_id: 'mem-1', revision: 1 }],
    }),
    [],
  )
})

test('requires a direct predecessor to retain the envelope stable memory ID', () => {
  assert.deepEqual(
    validateMemoryLifecycle({
      content: 'I prefer dark mode.',
      lifecycle: {
        action: 'update',
        status: 'active',
        revision: 2,
        previous_revision: { memory_id: 'other-memory', revision: 1 },
      },
    }, { memoryId: 'mem-preference-theme' }),
    ['MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH'],
  )
})

test('rejects a predecessor revision that skips a number, at the single-document level', () => {
  assert.deepEqual(
    validateMemoryLifecycle({
      content: 'I prefer dark mode.',
      lifecycle: {
        action: 'update',
        status: 'active',
        revision: 5,
        previous_revision: { memory_id: 'abc', revision: 2 },
      },
    }, { memoryId: 'abc' }),
    ['MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION'],
  )
})

test('requires explicit consent for a sensitive-category memory even with no lifecycle at all', () => {
  assert.deepEqual(
    validateMemoryLifecycle({ content: 'I have diabetes.', category: 'health' }),
    ['MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT'],
  )
})

test('rejects an authored status of superseded, which is derived read-side state only', () => {
  assert.deepEqual(
    validateMemoryLifecycle({
      content: 'I prefer dark mode.',
      lifecycle: { action: 'create', status: 'superseded', revision: 1 },
    }),
    ['MEMORY_LIFECYCLE_ACTIVE_ACTION_REQUIRES_ACTIVE_STATUS'],
  )
})

test('lifecycle invalid vectors declare the deterministic validator error', () => {
  const vectorsDir = path.join(__dirname, '..', 'conformance', 'vectors', 'kinds')
  for (const name of fs.readdirSync(vectorsDir).filter(name => name.startsWith('memory.lifecycle.invalid.'))) {
    const vector = JSON.parse(fs.readFileSync(path.join(vectorsDir, name), 'utf8'))
    assert.ok(validateMemoryLifecycle(vector.body).includes(vector._error), name)
  }
})
