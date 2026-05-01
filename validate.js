#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function collectVectors(root) {
  const out = []
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.json')) continue
    out.push(path.join(root, name))
  }
  return out.sort()
}

function validateConversationShape(doc) {
  if (!doc || typeof doc !== 'object') return ['root must be object']
  if (typeof doc.uacp_export === 'string') return []
  if (typeof doc.uacp_encrypted === 'string') return []
  if (typeof doc.uacp !== 'string') return ['uacp must be string']
  if (!Array.isArray(doc.messages)) return ['messages must be array']
  return []
}

function main() {
  const vectorsDir = path.resolve(process.cwd(), 'test-vectors')
  const vectors = collectVectors(vectorsDir)
  let passed = 0
  let failed = 0
  for (const file of vectors) {
    try {
      const doc = readJson(file)
      const errs = validateConversationShape(doc)
      const expectInvalid = doc && doc._expect === 'invalid'
      const ok = errs.length === 0
      if (expectInvalid ? !ok : ok) {
        passed += 1
      } else {
        failed += 1
        console.error(`FAIL ${path.basename(file)}: ${errs.join('; ') || 'expected invalid'}`)
      }
    } catch (e) {
      failed += 1
      console.error(`FAIL ${path.basename(file)}: ${e.message}`)
    }
  }
  console.log(`UACP validate: pass=${passed} fail=${failed}`)
  process.exit(failed ? 1 : 0)
}

main()
