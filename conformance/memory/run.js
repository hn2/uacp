const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { validateMemoryLifecycle } = require('../../lib/memory-lifecycle')
const { validateMemoryProfile } = require('../../lib/memory-profile')
const { canonicalJSON } = require('../../signing')

function referenceKey(reference) {
  return `${reference.memory_id}@${reference.revision}`
}

function validateEnvelopeSignature(memory) {
  const signature = memory.signature
  if (typeof signature !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(signature)) {
    return 'MEMORY_SEQUENCE_SIGNATURE_REQUIRED'
  }

  const { signature: _signature, ...unsigned } = memory
  const expected = `sha256:${createHash('sha256').update(canonicalJSON(unsigned)).digest('hex')}`
  return signature === expected ? null : 'MEMORY_SEQUENCE_SIGNATURE_INVALID'
}

function validateSequence(memories, { requireSignedEnvelopes = false } = {}) {
  const errors = []
  const seen = new Map()
  const profileClaims = new Map()

  for (const memory of memories) {
    if (requireSignedEnvelopes) {
      const signatureError = validateEnvelopeSignature(memory)
      if (signatureError) errors.push(signatureError)
    }

    const lifecycle = memory.body?.lifecycle
    if (!lifecycle) {
      errors.push('MEMORY_SEQUENCE_LIFECYCLE_REQUIRED')
      continue
    }

    errors.push(...validateMemoryLifecycle(memory.body, { memoryId: memory.id }))
    errors.push(...validateMemoryProfile(memory.body))
    const key = `${memory.id}@${lifecycle.revision}`
    if (seen.has(key)) {
      errors.push('MEMORY_SEQUENCE_DUPLICATE_REVISION')
      continue
    }

    if (lifecycle.previous_revision) {
      const predecessor = referenceKey(lifecycle.previous_revision)
      if (!seen.has(predecessor)) {
        errors.push('MEMORY_SEQUENCE_PREDECESSOR_NOT_FOUND')
      }
      if (lifecycle.previous_revision.revision !== lifecycle.revision - 1) {
        errors.push('MEMORY_SEQUENCE_NON_CONTIGUOUS_REVISION')
      }
    }

    for (const reference of [...(memory.body.supersedes || []), ...(memory.body.derived_from || [])]) {
      if (!seen.has(referenceKey(reference))) {
        errors.push('MEMORY_SEQUENCE_REFERENCE_NOT_FOUND')
      }
    }

    seen.set(key, memory)

    const link = memory.body.profile_link
    const status = lifecycle.status || 'active'
    if (link && status === 'active') {
      const claimKey = `${memory.subject || 'anonymous'}|${memory.scope || 'individual'}|${link.schema_id}@${link.schema_version}|${link.field}`
      const claims = profileClaims.get(claimKey) || []
      claims.push(link.conflict || 'none')
      profileClaims.set(claimKey, claims)
    }
  }

  for (const claims of profileClaims.values()) {
    if (claims.length > 1 && claims.some(conflict => conflict !== 'unresolved')) {
      errors.push('MEMORY_PROFILE_FIELD_CONFLICT')
    }
  }

  return [...new Set(errors)]
}

function runMemoryLifecycleVectors(vectorsDir) {
  const results = []
  for (const name of fs.readdirSync(vectorsDir).filter(name => name.endsWith('.json')).sort()) {
    const vector = JSON.parse(fs.readFileSync(path.join(vectorsDir, name), 'utf8'))
    const errors = validateSequence(vector.memories || [], {
      requireSignedEnvelopes: vector.require_signed_envelopes === true,
    })
    const accepted = errors.length === 0
    const passed = vector.expected_outcome === (accepted ? 'accepted' : 'rejected') &&
      (!vector.expected_error || errors.includes(vector.expected_error))
    results.push({ vector_id: vector.id || name, passed, errors })
  }
  return results
}

function main() {
  const vectorsDir = path.join(__dirname, 'vectors')
  const results = runMemoryLifecycleVectors(vectorsDir)
  const failed = results.filter(result => !result.passed)

  console.log('UACP Memory Lifecycle Conformance')
  console.log(`Passed: ${results.length - failed.length}  Failed: ${failed.length}`)
  for (const result of results) {
    console.log(`${result.passed ? '✓' : '✗'} ${result.vector_id}${result.errors.length ? ` (${result.errors.join(', ')})` : ''}`)
  }
  process.exitCode = failed.length ? 1 : 0
}

if (require.main === module) main()

module.exports = { runMemoryLifecycleVectors, validateEnvelopeSignature, validateSequence }
