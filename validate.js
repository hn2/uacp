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
  const kindSchemaDir = path.join(schemaDir, 'v1', 'kinds')
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

  if (fs.existsSync(kindSchemaDir)) {
    for (const name of fs.readdirSync(kindSchemaDir)) {
      if (!name.endsWith('.schema.json')) continue
      const schema = readJson(path.join(kindSchemaDir, name))
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
    return 'https://hn2.github.io/uacp/schema/0.6.0/export'
  }
  return 'https://hn2.github.io/uacp/schema/0.6.0/conversation'
}

function detectKindSchemaId(doc) {
  if (doc && typeof doc.kind === 'string' && doc.body !== undefined) {
    return `https://hn2.github.io/uacp/schema/v1/kinds/${doc.kind}`
  }
  return null
}

function collectVectors(args) {
  if (args.length > 0) {
    return args.map(a => path.resolve(process.cwd(), a)).sort()
  }
  const vectorsDir = path.resolve(__dirname, 'test-vectors')
  const extVectorsDir = path.join(vectorsDir, 'extensions')
  const kindVectorsDir = path.resolve(__dirname, 'conformance', 'vectors', 'kinds')

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

  const kindVectors = []
  if (fs.existsSync(kindVectorsDir)) {
    for (const n of fs.readdirSync(kindVectorsDir)) {
      if (n.endsWith('.json')) kindVectors.push(path.join(kindVectorsDir, n))
    }
  }

  return [...coreVectors, ...extVectors, ...kindVectors].sort()
}

function main() {
  const args = process.argv.slice(2)
  const ajv = loadSchemas()
  const files = collectVectors(args)
  const harnessModeActive = args.length === 0
  let passed = 0
  let failed = 0

  for (const file of files) {
    const name = path.relative(path.resolve(__dirname), file)
    try {
      const doc = readJson(file)

      // Kind conformance vectors use _schema and _expect at top level
      const kindSchema = doc._schema
      const expectInvalidKind = harnessModeActive && doc._expect === 'invalid'

      if (kindSchema) {
        const kindSchemaId = `https://hn2.github.io/uacp/schema/v1/kinds/${kindSchema}`
        const bodyToValidate = doc.body !== undefined ? doc.body : doc
        const valid = ajv.validate(kindSchemaId, bodyToValidate)
        const errors = ajv.errors || []

        if (expectInvalidKind) {
          if (!valid) {
            passed += 1
            const reason = errors.map(e => `body/${(e.instancePath || '').replace(/^\//, '')} ${e.message}`.trim()).join('; ')
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
            const reason = errors.map(e => `body/${(e.instancePath || '').replace(/^\//, '')} ${e.message}`.trim()).join('; ')
            console.error(`✗ ${name}: ${reason}`)
          }
        }
        continue
      }

      const expectInvalid = harnessModeActive && doc && doc.metadata && doc.metadata['uacp.test.expect'] === 'invalid'
      const schemaId = detectSchemaId(doc)
      const valid = ajv.validate(schemaId, doc)
      const errors = ajv.errors || []

      // Also validate body against kind schema if envelope has kind + body
      const kindSchemaId = detectKindSchemaId(doc)
      let kindErrors = []
      if (kindSchemaId && ajv.getSchema(kindSchemaId)) {
        const kindValid = ajv.validate(kindSchemaId, doc.body)
        kindErrors = (ajv.errors || []).map(e => ({ ...e, instancePath: `body${e.instancePath}` }))
        if (!kindValid) {
          kindErrors.forEach(e => errors.push(e))
        }
      }

      if (expectInvalid) {
        if (!valid || kindErrors.length > 0) {
          passed += 1
          const allErrors = [...errors]
          const reason = allErrors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ')
          console.log(`✓ ${name} (expected invalid — ${reason})`)
        } else {
          failed += 1
          console.error(`✗ ${name}: expected validation failure but document passed`)
        }
      } else {
        if (valid && kindErrors.length === 0) {
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
