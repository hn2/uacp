# UACP Changelog

## [0.4.0] — 2026-04-29

### Added — normative
- **Per-message provenance** (`provenance`, `confidence`, `provenance_source`) on the `message` object.
  - `provenance`: `"extracted" | "inferred" | "system" | "tool_output"` — origin of message content.
  - `confidence` (number 0–1): producer's self-reported confidence. REQUIRED when `provenance=inferred`. MUST NOT be present when `provenance=extracted`.
  - `provenance_source` (string ≤ 256): optional identifier of the upstream source (e.g. `"claude-opus-4-7"`, `"cursor-memory-v2"`, `"user-profile-doc#L42"`).
- Schema conditional enforcement via `allOf` `if/then` rules.
- **CONFORMANCE.md §4 Provenance**: normative MUST/SHOULD table; L2 conformance now requires emitting `provenance` on every message.
- **5 new test vectors** (`16–20`): extracted, inferred-with-confidence, system+tool_output, negative (confidence-on-extracted rejected), back-compat (no provenance).

### Back-compat
- Absence of `provenance` is valid — defaults are documented in spec but not schema-enforced, preserving v0.3.0 document compatibility.
- All v0.3.0 test vectors continue to validate against the v0.4.0 schema.

## v0.3.0 (2026-04-24)

### Added — normative
- **Conventions** section in the spec: RFC 2119 / 8174 keyword usage; timestamp format pinned to RFC 3339 UTC with ms precision (`YYYY-MM-DDTHH:MM:SS.sssZ`); character-offset fields (citation `span`) pinned to Unicode scalar values.
- **§6 Encryption Envelope rewritten** with a normative field-level table and canonical KDF parameters in-schema, not in prose only: `argon2id = {m:65536, t:3, p:1, output_length:32}`, `hkdf = {hash:"sha256", output_length:32}`, `info = "uacp-key-v1"`. `iv` pinned to 12-byte lowercase hex (24 chars). `auth_tag` pinned to 16-byte lowercase hex (32 chars). Canonical AAD default defined: `"{uacp_encrypted}:{info}"`.
- **§6.2 Key derivation pseudocode** with full dataflow (master_key → content_key → AES-GCM).
- **§10 Schema extension policy**: conversation / message / content_block / artifact / tool_call / attachment / citation / redactions objects are closed. Vendor extensions MUST live under the per-object `metadata` key.
- **§12 "What counts as breaking" normative list** defining the 5 conditions that force a major bump.
- **Redactions object** now has a proper schema (`count`, `categories` enum, `placeholder_format` template) instead of free-form prose.
- **Citation span semantics** pinned to half-open `[start, end)` in Unicode scalar values.
- **5 new test vectors**: `11-empty-messages-refused` (negative), `12-rtl-hebrew-citation`, `13-deep-branches` (branch-of-branch + canonical-leaf rule), `14-tool-call-correlation` (paired tool message), `15-redactions-and-metadata` (vendor metadata round-trip).
- **GOVERNANCE.md** — change process, version gates, IP stance, security contact.
- **LICENSE** — dual CC BY 4.0 (spec text) + MIT (schemas, vectors, harness code).
- **CONFORMANCE.md rewritten** with normative level definitions, numbered test checklist, and an implementable `UACPImpl` TypeScript interface.

### Changed
- All JSON Schemas moved from `additionalProperties: true` (or unset) to `unevaluatedProperties: false` on closed objects. Unknown keys on a message or content_block now fail strict validation; unknown keys inside any `metadata` object still pass.
- `content_block` schema uses `if/then` to enforce per-type required fields (`text` blocks need `text`, `code` blocks need `code`, media blocks need one of `url`/`data`, etc.).
- `tool` field schema now correctly accepts `string | string[]` to match the spec text.
- `citation.span.items` tightened from `number` to `integer ≥ 0`.
- Export schema's `conversations[]` items now `$ref` the conversation schema instead of `type: object`.
- Envelope schema is now `additionalProperties: false`.

### Fixed
- Test vector `09-encrypted-envelope` updated to include all required KDF sub-objects and a base64url salt that validates under the new pattern.
- All other test vectors bumped to `uacp: "0.3.0"` / `uacp_export: "0.3.0"` / `uacp_encrypted: "0.3.0"`.

### Deprecated
- Legacy `tool_call_id` / `id` aliases on tool-role messages remain valid for v0.x but will be removed at v1.0. Writers SHOULD emit `call_id`.

## v0.2.0 (2026-04-21)

### Added
- §2.1 Conversation branching (`parent_id`, `branches`, `uacp.branch_nodes`)
- §2.2 Reasoning/thinking content block (`type: "thinking"`)
- §2.3 Citations array on assistant messages
- §2.4 Artifacts + `artifact_ref` content block
- §2.5 Message `status` field (`complete`, `in_progress`, `error`)
- §2.6 Model field expanded — object form `{ id, provider, snapshot_date }`
- §2.7 Multimodal content types: `audio`, `video`, `pdf`, `latex`
- §2.8 Code block schema: `language`, `code`, `filename`
- §10 Extension namespace rule (reverse-domain required for custom types)
- §12 Version negotiation rules (unknown fields MUST be preserved on round-trip)
- §13 Conformance levels (L1 Minimal, L2 Standard, L3 Full)
- §14 Deprecation policy
- §15 v0.2.0 fields reference
- Appendix B: MCP interop mapping
- Appendix C: UACP vs MCP comparison

### Fixed (from v0.2.0 cleanup pass)
- §1: "Universal" → "Unified" in body text (title was already correct)
- `id` field: ULID/UUID v7 recommendation added
- `tool` field: accepts `string | string[]`; `tool_chain` optional field added
- `messages`: explicit array-index-authoritative ordering rule
- `system` role: zero or one, must be index 0
- `call_id` normalization: legacy `id`/`tool_call_id` are aliases
- `attachments`: full object schema defined
- `redactions` optional field per message
- §4: 8 additional tool identifiers (claude-ai, zed, warp, pieces, raycast, openwebui, anythingllm, jetbrains-ai)
- §6: canonical Argon2id params specified (`m=65536, t=3, p=1`)

## v0.1.0 (2026-04-17)

Initial draft specification.

- Conversation object schema (required + optional fields)
- Message object schema (4 roles, content block types)
- Tool identifiers table (27 tools)
- Privacy levels
- Encryption envelope (AES-256-GCM)
- Context injection format
- Export/import format
- Sync protocol (delta sync + upload)
- Extensibility via metadata namespaces
- MIME type + file extension
- Versioning (semantic versioning)
