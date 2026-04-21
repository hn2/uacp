# UACP Changelog

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
