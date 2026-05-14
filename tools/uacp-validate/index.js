#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Minimal YAML block-scalar parser (no external dependencies)
// Supports the UACP envelope structure: flat and one-level-deep mappings,
// sequences of scalars, and quoted/unquoted string values.
// ---------------------------------------------------------------------------

function parseYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return parseBlock(lines, 0, 0).value;
}

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function isComment(line) {
  return line.trim().startsWith('#') || line.trim() === '';
}

function parseScalar(raw) {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  const n = Number(s);
  if (!isNaN(n) && s !== '') return n;
  return s;
}

function parseBlock(lines, startLine, baseIndent) {
  let i = startLine;
  // skip blanks/comments to determine block type
  while (i < lines.length && isComment(lines[i])) i++;
  if (i >= lines.length) return { value: null, nextLine: i };

  const firstLine = lines[i];
  if (firstLine.trim().startsWith('- ') || firstLine.trim() === '-') {
    return parseSequence(lines, i, baseIndent);
  }
  return parseMapping(lines, i, baseIndent);
}

function parseMapping(lines, startLine, baseIndent) {
  const obj = {};
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i];
    if (isComment(line)) { i++; continue; }
    const indent = indentOf(line);
    if (indent < baseIndent) break;
    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(': ');
    const trailingColon = trimmed.endsWith(':');
    if (colonIdx === -1 && !trailingColon) { i++; continue; }

    let key, rest;
    if (colonIdx !== -1) {
      key = trimmed.slice(0, colonIdx).trim();
      rest = trimmed.slice(colonIdx + 2).trim();
    } else {
      key = trimmed.slice(0, -1).trim();
      rest = '';
    }

    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);

    i++;
    if (rest === '' || rest === '|' || rest === '>') {
      // value is on next lines
      while (i < lines.length && isComment(lines[i])) i++;
      if (i < lines.length) {
        const childIndent = indentOf(lines[i]);
        if (childIndent > indent) {
          const { value, nextLine } = parseBlock(lines, i, childIndent);
          obj[key] = value;
          i = nextLine;
          continue;
        }
      }
      obj[key] = null;
    } else {
      obj[key] = parseScalar(rest);
    }
  }
  return { value: obj, nextLine: i };
}

function parseSequence(lines, startLine, baseIndent) {
  const arr = [];
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i];
    if (isComment(line)) { i++; continue; }
    const indent = indentOf(line);
    if (indent < baseIndent) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') && trimmed !== '-') break;
    const itemRaw = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : '';
    i++;
    if (itemRaw === '') {
      // multi-line item (mapping or sequence)
      while (i < lines.length && isComment(lines[i])) i++;
      if (i < lines.length) {
        const childIndent = indentOf(lines[i]);
        if (childIndent > indent) {
          const { value, nextLine } = parseBlock(lines, i, childIndent);
          arr.push(value);
          i = nextLine;
          continue;
        }
      }
      arr.push(null);
    } else {
      arr.push(parseScalar(itemRaw));
    }
  }
  return { value: arr, nextLine: i };
}

// ---------------------------------------------------------------------------
// Canonical JSON (keys sorted lexicographically, no extra whitespace)
// ---------------------------------------------------------------------------

function canonicalize(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// Envelope validation
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  'uacp_version', 'kind', 'id', 'schema_version', 'version',
  'author', 'created_at', 'body'
];

const CORE_KINDS = new Set([
  'memory', 'policy', 'guideline', 'persona', 'redaction-pattern',
  'source', 'theme', 'trace', 'pack', 'playbook'
]);

const KIND_PATTERN = /^([a-z][a-z0-9-]*|[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/;
const ISO8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function validate(envelope) {
  const errors = [];

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (envelope[field] === undefined || envelope[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) return errors;

  // uacp_version must be 1
  if (envelope.uacp_version !== 1) {
    errors.push(`uacp_version must be 1 (found: ${envelope.uacp_version}). Implementations MUST refuse uacp_version > 1.`);
  }

  // kind format
  if (typeof envelope.kind !== 'string' || !KIND_PATTERN.test(envelope.kind)) {
    errors.push(`kind "${envelope.kind}" is invalid. Core kinds are lowercase, custom kinds must be namespaced as vendor/name.`);
  }

  // id is non-empty string
  if (typeof envelope.id !== 'string' || envelope.id.trim() === '') {
    errors.push('id must be a non-empty string.');
  }

  // schema_version is positive integer
  if (!Number.isInteger(envelope.schema_version) || envelope.schema_version < 1) {
    errors.push('schema_version must be a positive integer.');
  }

  // version is semver
  if (typeof envelope.version !== 'string' || !SEMVER_PATTERN.test(envelope.version)) {
    errors.push(`version "${envelope.version}" is not valid semver.`);
  }

  // author is non-empty string
  if (typeof envelope.author !== 'string' || envelope.author.trim() === '') {
    errors.push('author must be a non-empty string.');
  }

  // created_at is ISO 8601 UTC
  if (typeof envelope.created_at !== 'string' || !ISO8601_UTC.test(envelope.created_at)) {
    errors.push(`created_at "${envelope.created_at}" must be ISO 8601 in UTC (e.g., 2026-05-14T09:00:00Z).`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(envelope) {
  const sig = envelope.signature;
  if (!sig) return { present: false };

  if (!sig.startsWith('sha256:')) {
    return { present: true, valid: false, reason: `Unsupported signature scheme. Expected sha256:<hex>, got: ${sig}` };
  }

  const declared = sig.slice('sha256:'.length);
  const withoutSig = Object.assign({}, envelope);
  delete withoutSig.signature;
  const canonical = canonicalize(withoutSig);
  const computed = crypto.createHash('sha256').update(canonical).digest('hex');

  if (computed !== declared) {
    return {
      present: true, valid: false,
      reason: `SHA-256 mismatch.\n  declared: ${declared}\n  computed: ${computed}`
    };
  }
  return { present: true, valid: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node index.js <path-to-yaml-file>');
  process.exit(1);
}

const absPath = path.resolve(filePath);
let raw;
try {
  raw = fs.readFileSync(absPath, 'utf8');
} catch (err) {
  console.error(`FAIL: Cannot read file: ${absPath}\n  ${err.message}`);
  process.exit(1);
}

let envelope;
try {
  envelope = parseYaml(raw);
} catch (err) {
  console.error(`FAIL: YAML parse error in ${absPath}\n  ${err.message}`);
  process.exit(1);
}

if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
  console.error(`FAIL: ${absPath} — top-level document must be a YAML mapping.`);
  process.exit(1);
}

const errors = validate(envelope);
if (errors.length > 0) {
  console.error(`FAIL: ${absPath}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const sigResult = verifySignature(envelope);
if (sigResult.present && !sigResult.valid) {
  console.error(`FAIL: ${absPath} — signature verification failed.\n  ${sigResult.reason}`);
  process.exit(1);
}

if (!sigResult.present) {
  console.warn(`WARN: ${absPath} — no signature field. Unsigned artifacts should only be used in development.`);
}

console.log(`PASS: ${absPath}`);
process.exit(0);
