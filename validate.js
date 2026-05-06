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
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  for (const name of fs.readdirSync(schemaDir)) {
    if (!name.endsWith('.schema.json')) continue
    const schema = readJson(path.join(schemaDir, name))
    ajv.addSchema(schema, schema['$id'])
  }
  return ajv
}

function detectSchemaId(doc) {
  if (doc && typeof doc.uacp_encrypted === 'string') {
    return 'https://fusionlayer.app/uacp/schema/0.4.0/encrypted-envelope'
  }
  if (doc && typeof doc.uacp_export === 'string') {
    return 'https://fusionlayer.app/uacp/schema/0.4.0/export'
  }
  return 'https://fusionlayer.app/uacp/schema/0.4.0/conversation'
}

function collectVectors(args) {
  if (args.length > 0) {
    return args.map(a => path.resolve(process.cwd(), a)).sort()
  }
  const vectorsDir = path.resolve(__dirname, 'test-vectors')
  return fs.readdirSync(vectorsDir)
    .filter(n => n.endsWith('.json'))
    .map(n => path.join(vectorsDir, n))
    .sort()
}

function main() {
  const ajv = loadSchemas()
  const files = collectVectors(process.argv.slice(2))
  let passed = 0
  let failed = 0

  for (const file of files) {
    const name = path.basename(file)
    try {
      const doc = readJson(file)
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

  console.log(`\nUACP validate: pass=${passed} fail=${failed}`)
  process.exit(failed ? 1 : 0)
}

main()
