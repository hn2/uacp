const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runMemoryLifecycleVectors, validateEnvelopeSignature } = require('../conformance/memory/run')

test('memory lifecycle sequence vectors match their expected outcomes', () => {
  const vectorsDir = path.join(__dirname, '..', 'conformance', 'memory', 'vectors')
  const results = runMemoryLifecycleVectors(vectorsDir)
  assert.equal(results.filter(result => !result.passed).length, 0)
  assert.equal(results.length, 9)
})

test('signed memory envelopes require an intact UACP v1 sha256 signature', () => {
  const vectorPath = path.join(__dirname, '..', 'conformance', 'memory', 'vectors', '07-valid-signed-lifecycle-chain.json')
  const envelope = JSON.parse(fs.readFileSync(vectorPath, 'utf8')).memories[0]

  assert.equal(validateEnvelopeSignature(envelope), null)
  assert.equal(validateEnvelopeSignature({ ...envelope, body: { ...envelope.body, content: 'tampered' } }), 'MEMORY_SEQUENCE_SIGNATURE_INVALID')
  assert.equal(validateEnvelopeSignature({ ...envelope, signature: undefined }), 'MEMORY_SEQUENCE_SIGNATURE_REQUIRED')
})
