#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function loadSchemas() {
  const schemaDir = path.resolve(__dirname, 'schema')
  const extSchemaDir = path.join(schemaDir, 'extensions')
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)

  for (const name of fs.readdirSync(schemaDir)) {
    if (!name.endsWith('.schema.json')) continue
    const schema = readJson(path.join(schemaDir, name))
    if (schema['$id']) ajv.addSchema(schema, schema['$id'])
  }

  if (fs.existsSync(extSchemaDir)) {
    for (const name of fs.readdirSync(extSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = readJson(path.join(extSchemaDir, name))
      if (schema['$id']) ajv.addSchema(schema, schema['$id'])
    }
  }

  return ajv
}

function detectSchemaId(doc) {
  if (doc && typeof doc.uacp_encrypted === 'string') {
    return 'https://hn2.github.io/uacp/schema/0.5.0/extensions/uacp-encryption'
  }
  if (doc && typeof doc.uacp_export === 'string') {
    return 'https://hn2.github.io/uacp/schema/0.7.0/export'
  }
  return 'https://hn2.github.io/uacp/schema/0.7.0/conversation'
}

function collectVectors(args) {
  if (args.length > 0) {
    return args.map(a => path.resolve(process.cwd(), a)).sort()
  }
  const vectorsDir = path.resolve(__dirname, 'test-vectors')
  const extVectorsDir = path.join(vectorsDir, 'extensions')

  const coreVectors = fs.readdirSync(vectorsDir)
    .filter(n => n.endsWith('.json'))
    .map(n => path.join(vectorsDir, n))

  const extVectors = []
  if (fs.existsSync(extVectorsDir)) {
    for (const extName of fs.readdirSync(extVectorsDir)) {
      const extDir = path.join(extVectorsDir, extName)
      if (!fs.statSync(extDir).isDirectory()) continue
      for (const n of fs.readdirSync(extDir)) {
        if (n.endsWith('.json')) extVectors.push(path.join(extDir, n))
      }
    }
  }

  return [...coreVectors, ...extVectors].sort()
}

function main() {
  const ajv = loadSchemas()
  const files = collectVectors(process.argv.slice(2))
  let passed = 0
  let failed = 0

  let skipped = 0

  for (const file of files) {
    const name = path.relative(path.resolve(__dirname, 'test-vectors'), file)
    try {
      const doc = readJson(file)
      const scope = doc && doc.metadata && doc.metadata['uacp.test.scope']
      if (scope === 'reference-impl') {
        skipped += 1
        console.log(`- ${name} (skipped — reference-impl scope)`)
        continue
      }
      const expectInvalid = doc && doc.metadata && doc.metadata['uacp.test.expect'] === 'invalid'
      const schemaId = detectSchemaId(doc)
      const valid = ajv.validate(schemaId, doc)
      const errors = ajv.errors || []

      if (expectInvalid) {
        if (!valid) {
          passed += 1
          const reason = errors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
          console.log(`✓ ${name} (expected invalid — ${reason})`)
        } else {
          failed += 1
          console.error(`✗ ${name}: expected validation failure but document passed`)
        }
      } else {
        if (valid) {
          passed += 1
          console.log(`✓ ${name}`)
        } else {
          failed += 1
          const reason = errors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
          console.error(`✗ ${name}: ${reason}`)
        }
      }
    } catch (e) {
      failed += 1
      console.error(`✗ ${name}: ${e.message}`)
    }
  }

  console.log(`\nUACP validate: pass=${passed} fail=${failed} skipped=${skipped}`)
  process.exit(failed ? 1 : 0)
}

main()
