const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const { validateMemoryProfile } = require('../lib/memory-profile')

const SCHEMA_ID = 'https://hn2.github.io/uacp/schema/v1/kinds/memory'

function loadValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../schema/v1/kinds/memory.schema.json'), 'utf8'))
  ajv.addSchema(schema, SCHEMA_ID)
  return ajv
}

const ajv = loadValidator()

function schemaValid(body) {
  return ajv.validate(SCHEMA_ID, body)
}

test('allows core and namespaced profile schema links', () => {
  assert.deepEqual(validateMemoryProfile({
    profile_link: { schema_id: 'user', schema_version: 1, field: 'display_name' },
  }), [])
  assert.deepEqual(validateMemoryProfile({
    profile_link: { schema_id: 'acme/employee', schema_version: 2, field: '/department/name' },
  }), [])
})

test('rejects an unknown unnamespaced profile schema', () => {
  assert.deepEqual(validateMemoryProfile({
    profile_link: { schema_id: 'employee', schema_version: 1, field: 'department' },
  }), ['MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA'])
})

test('schema rejects a profile_link.field with disallowed characters', () => {
  assert.equal(schemaValid({
    content: 'Prefers dark mode.',
    profile_link: { schema_id: 'user', schema_version: 1, field: 'display name!' },
  }), false)
})

test('schema accepts a plain field identifier and a JSON Pointer field', () => {
  assert.equal(schemaValid({
    content: 'Prefers dark mode.',
    profile_link: { schema_id: 'user', schema_version: 1, field: 'display_name' },
  }), true)
  assert.equal(schemaValid({
    content: 'Prefers dark mode.',
    profile_link: { schema_id: 'acme/employee', schema_version: 2, field: '/department/name' },
  }), true)
})
