# UACP Conformance

This document defines what it means for an implementation to conform to UACP
v0.5.0, the interface a test harness expects, and the registry of verified
implementations.

## 1. Conformance levels

UACP uses a layered conformance model. Core conformance (L1–L3) is about the
conversation document format only. Extensions are optional capabilities that
implementations may additionally declare.

| Level | Label | Requirements |
|-------|-------|--------------|
| **L1** | Minimal  | Core only. Required fields; text-only content; no tool_calls. No privacy or encryption assumption. |
| **L2** | Standard | Core + full message types; tool_calls + matching tool-role messages; attachments. MAY declare extensions. |
| **L3** | Full     | L2 + branches; artifacts; thinking blocks; citations; multimodal; streaming status; redactions. MAY declare any extensions. |

Extensions are declared separately. An implementation that supports
`uacp-encryption` declares it on top of its core level (e.g. "L2 + uacp-encryption").

An implementation MAY claim the highest level it passes. Claims are verified by
the harness in §3. Unverified claims are self-declared and carry no trust.

## 2. Conformance tests (normative)

To claim level N, an implementation MUST pass every check below at or below N:

1. **Schema** — emits documents that validate against the published JSON
   Schemas (`schema/conversation.schema.json`, `schema/export.schema.json`).
   Extension schemas (`schema/extensions/`) are required only for documents that
   declare the corresponding extension.
2. **Round-trip** — parsing any published test vector, then re-emitting it,
   produces a document that differs from the input only in whitespace and key
   order under JCS (RFC 8785) canonicalization. No fields added, dropped, or
   semantically altered. Unknown `metadata.*` keys MUST survive round-trip.
3. **Version acceptance** — MUST parse any document whose `uacp` field has the
   same major version. MUST preserve (and not error on) unknown keys inside
   any `metadata` object.
4. **Timestamps** — MUST parse `YYYY-MM-DDTHH:MM:SS.sssZ` and
   `YYYY-MM-DDTHH:MM:SSZ`. MUST emit only UTC. MUST NOT emit offsets.
5. **Citation spans** — MUST be counted in Unicode scalar values across the
   flattened text of the message content. Byte/UTF-16/grapheme counts fail
   this check.
6. **Tool-call correlation** (L2+) — every `tool_calls[].call_id` on an
   assistant message SHOULD have at most one matching `role: "tool"` message
   with the same `call_id`. Orphan tool results raise a warning, not an
   error, unless the implementation declares "strict" conformance.
7. **Extension: uacp-encryption** (optional) — if the implementation emits
   encrypted envelopes, they MUST satisfy: algorithm = `aes-256-gcm`; IV = fresh
   random 12 bytes hex; auth_tag = 16 bytes hex; KDF params pinned to
   `argon2id(m=65536, t=3, p=1, L=32) + HKDF-SHA256(info="uacp-key-v1", L=32)`.
   AAD default = `"{uacp_encrypted}:{info}"` UTF-8 bytes when envelope `aad` is
   empty. This check is NOT required for L1, L2, or L3 — only for implementations
   that declare the `uacp-encryption` extension.
8. **Negative cases** — the harness's negative test vectors (any file whose
   inline `uacp.test.expect` is `"invalid"`) MUST be rejected.

## 3. Harness interface

Implementations provide a small adapter implementing this contract. The
reference harness lives at `conformance/harness/run.js` in this repository
and calls these methods.

```ts
interface UACPImpl {
  /** Parse a UACP document from a JSON string. Throw on invalid. */
  parse(json: string): unknown

  /** Serialize back to a JSON string. Output SHOULD be JCS-canonical for
   *  deterministic round-trip. */
  stringify(doc: unknown): string

  /** Validate against the embedded schemas. Return { ok, errors[] }. */
  validate(doc: unknown): { ok: boolean; errors: string[] }

  /** Encrypt a Conversation Object to an Encrypted Envelope using the
   *  caller-supplied passphrase. Only required if declaring uacp-encryption. */
  encrypt?(conversation: unknown, passphrase: string): unknown

  /** Decrypt an Encrypted Envelope with the caller-supplied passphrase.
   *  Only required if declaring uacp-encryption. */
  decrypt?(envelope: unknown, passphrase: string): unknown
}
```

Run the harness:

```bash
# Self-test (validate UACP's own test vectors):
node conformance/harness/run.js

# Test your implementation:
node conformance/harness/run.js --level L3 --impl ./path/to/my-impl.js
```

The harness iterates every file in `test-vectors/` (including `test-vectors/extensions/`),
honors the `uacp.test.expect` metadata hint, and reports a pass/fail summary plus
error detail per vector.

## 4. Provenance

Per-message provenance is a UACP v0.4.0 feature retained in v0.5.0. The following MUST/SHOULD rules apply:

| Rule | Level |
|------|-------|
| L2+ implementations MUST emit `provenance` on every message. | MUST |
| `provenance=inferred` MUST include a `confidence` value (0.0–1.0). | MUST |
| `provenance=extracted` MUST NOT include `confidence`. | MUST |
| `provenance_source` SHOULD be set when the origin is a named model or system. | SHOULD |
| L1 implementations MAY omit `provenance` (defaults: `user→extracted`, `assistant→inferred`, `system→system`, `tool→tool_output`). | MAY |

Provenance defaults are defined in the spec; they are **not enforced** by the schema for back-compat with older documents.

## 5. Extensions registry

| Extension ID | Schema | Spec | Description |
|---|---|---|---|
| `uacp-encryption` | `schema/extensions/uacp-encryption.schema.json` | `spec/extensions/uacp-encryption.md` | AES-256-GCM envelope |
| `uacp-branching` | `schema/extensions/uacp-branching.schema.json` | `spec/extensions/uacp-branching.md` | Conversation branching (regenerations, edits) |
| `uacp-reasoning` | `schema/extensions/uacp-reasoning.schema.json` | `spec/extensions/uacp-reasoning.md` | Reasoning / thinking blocks |
| `uacp-citations` | `schema/extensions/uacp-citations.schema.json` | `spec/extensions/uacp-citations.md` | Per-claim citations with kind, retrieved_at, anchor |
| `uacp-artifacts` | `schema/extensions/uacp-artifacts.schema.json` | `spec/extensions/uacp-artifacts.md` | Artifact version chain with lineage_id |

Implementations declare extensions via the top-level `extensions` array:

```json
{ "extensions": ["uacp-encryption"] }
```

## 6. Verified implementations

| Implementation | Language | Level | Extensions | Verified | Notes |
|---|---|---|---|---|---|
| UACP reference harness | JavaScript (Node.js) | L3 | uacp-encryption | 2026-05-07 | Ships with this repo at `conformance/harness/`. |

Implementations submit entries via PR against this file. The PR MUST include
a harness log showing all tests passing, the harness commit SHA, and the
impl SHA tested.

---

*UACP Conformance — see GOVERNANCE.md for maintainer policy.*
