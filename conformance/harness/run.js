#!/usr/bin/env node
// UACP Conformance Test Harness
// Run against any UACP implementation to verify L1/L2/L3 compliance.
//
// Usage: node conformance/harness/run.js [--level L1|L2|L3] [--impl ./path/to/my-impl.js]
//
// impl module must export:
//   parse(doc: object): object   — optional; UACP object → internal representation
//   serialize(internal: object): object — optional; internal → UACP object
//
// Without --impl: harness runs validation-only self-test against all test vectors.

const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const VECTORS_DIR = path.join(REPO_ROOT, 'test-vectors')
const SCHEMA_DIR = path.join(REPO_ROOT, 'schema')

// --- Schema loading ---
function loadAjv() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)

  for (const name of fs.readdirSync(SCHEMA_DIR)) {
    if (!name.endsWith('.schema.json')) continue
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'))
    if (schema['$id']) ajv.addSchema(schema, schema['$id'])
  }

  const extSchemaDir = path.join(SCHEMA_DIR, 'extensions')
  if (fs.existsSync(extSchemaDir)) {
    for (const name of fs.readdirSync(extSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = JSON.parse(fs.readFileSync(path.join(extSchemaDir, name), 'utf8'))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  return ajv
}

function detectSchemaId(doc) {
  if (doc && typeof doc.uacp_encrypted === 'string') return 'https://hn2.github.io/uacp/schema/0.5.0/extensions/uacp-encryption'
  if (doc && typeof doc.uacp_export === 'string') return 'https://hn2.github.io/uacp/schema/0.6.0/export'
  return 'https://hn2.github.io/uacp/schema/0.6.0/conversation'
}

function resolveValidationTarget(doc) {
  if (doc && typeof doc.fixture_id === 'string') {
    if (doc.event && typeof doc.event === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-sync-event', target: doc.event }
    }
    if (Array.isArray(doc.registrations) && doc.registrations.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-device-registration', target: doc.registrations[0] }
    }
    if (doc.payload && typeof doc.payload === 'object' && doc.payload.algorithm) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-event-payload', target: doc.payload }
    }
    if (doc.clocks && Array.isArray(doc.clocks)) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vector-clock', target: doc.clocks[0] }
    }
    if (doc.scopes && Array.isArray(doc.scopes)) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-scope-identifier', target: doc.scopes[0] }
    }
    if (doc.member_set && typeof doc.member_set === 'object') {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set', target: doc.member_set }
    }
    if (Array.isArray(doc.member_sets) && doc.member_sets.length > 0) {
      return { schemaId: 'https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-member-set', target: doc.member_sets[0] }
    }
  }
  return { schemaId: detectSchemaId(doc), target: doc }
}

function validateDoc(ajv, doc) {
  const { schemaId, target } = resolveValidationTarget(doc)
  const valid = ajv.validate(schemaId, target)
  const errors = (ajv.errors || []).map(e => `${e.instancePath || '(root)'} ${e.message}`)
  return { valid, errors }
}

// L1–L3 vector sets per CONFORMANCE.md (core-only vectors; extension vectors run separately)
const LEVEL_VECTORS = {
  L1: ['01-minimal-chat.uacp.json', '02-multi-message.uacp.json', '03-tool-use.uacp.json'],
  L2: ['04-multimodal-image.uacp.json', '05-branched-conversation.uacp.json', '06-with-artifacts.uacp.json'],
  L3: ['07-extended-thinking.uacp.json', '08-with-citations.uacp.json', '09-encrypted-envelope.uacp.json',
       '13-deep-branches.uacp.json', '14-tool-call-correlation.uacp.json', '15-redactions-and-metadata.uacp.json'],
}

async function runConformance({ level = 'L3', impl } = {}) {
  const ajv = loadAjv()
  const levelOrder = ['L1', 'L2', 'L3']
  const minIdx = levelOrder.indexOf(level)
  const levelsToTest = levelOrder.slice(0, minIdx + 1)

  const results = []
  let passed = 0
  let failed = 0

  // Collect core vectors + extension vectors + explicit invalid vectors
  const coreVectors = fs.readdirSync(VECTORS_DIR).filter(n => n.endsWith('.json')).sort()
  const extVectors = []
  const extVectorsBase = path.join(VECTORS_DIR, 'extensions')
  if (fs.existsSync(extVectorsBase)) {
    for (const extName of fs.readdirSync(extVectorsBase)) {
      const extDir = path.join(extVectorsBase, extName)
      if (!fs.statSync(extDir).isDirectory()) continue
      for (const n of fs.readdirSync(extDir)) {
        if (n.endsWith('.json')) extVectors.push(path.join(extDir, n))
      }
    }
  }
  const invalidVectors = []
  const invalidVectorsBase = path.join(VECTORS_DIR, 'invalid')
  if (fs.existsSync(invalidVectorsBase)) {
    for (const n of fs.readdirSync(invalidVectorsBase)) {
      if (n.endsWith('.json')) invalidVectors.push(path.join(invalidVectorsBase, n))
    }
  }
  const allVectors = [
    ...coreVectors.map(n => path.join(VECTORS_DIR, n)),
    ...extVectors.sort(),
    ...invalidVectors.sort(),
  ]

  for (const filePath of allVectors) {
    const filename = path.relative(VECTORS_DIR, filePath)
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
      results.push({ filename, pass: false, error: `parse error: ${e.message}` })
      failed++
      continue
    }

    const schemaErrorCodes = new Set(['invalid', 'UNKNOWN_ROLE'])
    const expectInvalid = (doc?.metadata?.['uacp.test.expect'] === 'invalid') ||
      (doc?.fixture_id && schemaErrorCodes.has(doc?.expected))
    const { valid, errors } = validateDoc(ajv, doc)

    if (expectInvalid) {
      if (!valid) {
        results.push({ filename, pass: true, note: `expected invalid — ${errors[0] ?? ''}` })
        passed++
      } else {
        results.push({ filename, pass: false, error: 'expected validation failure but passed' })
        failed++
      }
      continue
    }

    if (!valid) {
      results.push({ filename, pass: false, error: errors.join('; ') })
      failed++
      continue
    }

    // Optional round-trip test if impl provided
    if (impl?.parse && impl?.serialize) {
      try {
        const internal = impl.parse(doc)
        const exported = impl.serialize(internal)
        if (exported.id !== doc.id || exported.tool !== doc.tool) {
          results.push({ filename, pass: false, error: 'round-trip: id or tool changed' })
          failed++
          continue
        }
        if (exported.messages?.length !== doc.messages?.length) {
          results.push({ filename, pass: false, error: 'round-trip: message count changed' })
          failed++
          continue
        }
      } catch (err) {
        results.push({ filename, pass: false, error: `round-trip threw: ${err.message}` })
        failed++
        continue
      }
    }

    results.push({ filename, pass: true })
    passed++
  }

  return { level: computeAchievedLevel(results), passed, failed, results }
}

function computeAchievedLevel(results) {
  if (results.every(r => r.pass)) return 'L3'
  const l1Files = LEVEL_VECTORS.L1
  if (l1Files.every(f => results.find(r => r.filename === f)?.pass)) {
    const l2Files = [...LEVEL_VECTORS.L1, ...LEVEL_VECTORS.L2]
    if (l2Files.every(f => results.find(r => r.filename === f)?.pass)) return 'L2'
    return 'L1'
  }
  return 'none'
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2)
  let level = 'L3'
  let implPath = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--level' && args[i + 1]) level = args[++i]
    if (args[i] === '--impl' && args[i + 1]) implPath = args[++i]
  }

  let impl = null
  if (implPath) {
    impl = require(path.resolve(process.cwd(), implPath))
  }

  const result = await runConformance({ level, impl })

  console.log(`\nUACP Conformance Harness`)
  console.log(`========================`)
  console.log(`Conformance level achieved: ${result.level}`)
  console.log(`Passed: ${result.passed}  Failed: ${result.failed}\n`)

  for (const r of result.results) {
    const icon = r.pass ? '✓' : '✗'
    const extra = r.note ? ` (${r.note})` : r.error ? ` — ${r.error}` : ''
    console.log(`${icon} ${r.filename}${extra}`)
  }

  if (result.failed > 0) {
    console.log(`\n✗ Conformance check failed`)
    process.exit(1)
  } else {
    console.log(`\n✓ All checks passed`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
