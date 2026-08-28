const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const { validateMemoryTopics } = require('../lib/memory-topics')

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

test('accepts core and namespaced topics with typed metadata', () => {
  assert.deepEqual(validateMemoryTopics({
    topics: ['career', 'acme/mentorship'],
    metadata: [
      { key: 'importance', type: 'number', value: 3 },
      { key: 'acme/department', type: 'string', value: 'engineering' },
    ],
  }), [])
})

test('rejects unknown unnamespaced topics and metadata keys', () => {
  assert.deepEqual(validateMemoryTopics({
    topics: ['unregistered'],
    metadata: [{ key: 'unregistered', type: 'string', value: 'value' }],
  }), [
    'MEMORY_TOPIC_UNKNOWN_UNNAMESPACED',
    'MEMORY_METADATA_UNKNOWN_UNNAMESPACED_KEY',
  ])
})

test('schema and semantic validator agree that an underscore vendor prefix is not a valid namespaced metadata key', () => {
  const body = {
    content: 'Prefers dark mode.',
    metadata: [{ key: 'acme_corp/setting', type: 'string', value: 'x' }],
  }
  assert.equal(schemaValid(body), false)
  assert.deepEqual(validateMemoryTopics(body), ['MEMORY_METADATA_UNKNOWN_UNNAMESPACED_KEY'])
})
