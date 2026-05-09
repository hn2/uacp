# uacp-artifacts — Artifact Version Chain Extension

**Status:** Available
**Version:** 0.3.4
**Identifier:** `uacp-artifacts`
**Schema:** `schema/extensions/uacp-artifacts.schema.json`
**Conformance level:** L3 (additive)

---

## Purpose

`uacp-artifacts` adds explicit version-chain semantics to the core `artifact` object: a stable lineage identifier shared across all versions of the same logical artifact, and a back-pointer to the immediately prior version. With this extension, consumers can distinguish "version 2 of doc.md" from "a new doc.md" and reconstruct the edit history exactly.

This models Claude Artifacts panel edits and ChatGPT Canvas revisions.

---

## Schema patch (additive)

Four optional fields are added to each `artifact` object (which lives in `message.artifacts[]`):

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | integer ≥ 1 | yes when extension fields are used | Version number for this artifact. Monotonically increasing by 1 per `artifact_lineage_id`. |
| `artifact_lineage_id` | string (1–256) | no | Stable identifier shared across all versions of the same logical artifact. |
| `previous_version_id` | string (1–256) | required when `version > 1`; absent when `version == 1` | The `id` of the immediately prior artifact in the lineage. |
| `immutable` | boolean | no, default `true` | When `true`, the artifact's content MUST NOT be edited in place; new versions create new `id` values. |

---

## Placement

These fields are placed directly on each artifact object alongside `id`, `type`, `title`, `content`, etc.

---

## Semantics

- A linear version chain consists of artifacts that share the same `artifact_lineage_id` and form a single doubly-linked sequence via `id` ⇄ `previous_version_id`.
- Version 1 of a lineage MUST omit `previous_version_id`. Versions ≥ 2 MUST include it.
- `version` numbers MUST be strictly monotonic by 1 along the chain (no skipped numbers).
- `artifact_lineage_id` MUST be identical across every artifact in the chain.
- Consumers SHOULD render the latest version by default and offer access to history via the lineage.
- `immutable: true` (default) signals to consumers that prior versions are durable references; mutating prior content is undefined behavior.

---

## Validation rules (normative)

A validator that claims `uacp-artifacts` conformance MUST reject a document if any of the following hold:

1. An artifact uses any extension field (`artifact_lineage_id`, `previous_version_id`, `immutable`) and `version` is missing or not an integer ≥ 1.
2. `version == 1` and `previous_version_id` is present.
3. `version > 1` and `previous_version_id` is missing or not a non-empty string.
4. `previous_version_id` does not match the `id` of any artifact in the same conversation (dangling reference).
5. The previous artifact's `artifact_lineage_id` does not equal this artifact's `artifact_lineage_id` (lineage mismatch).
6. The previous artifact's `version` is `n` but this artifact's `version` is not `n + 1` (non-monotonic).
7. `artifact_lineage_id` is present and is empty or > 256 characters.
8. `immutable` is present and is not a boolean.

Validators MUST return errors in the standard `{ valid: false, errors: [{ path, code, message }] }` shape.

---

## Edge cases

- Two artifacts with the same `artifact_lineage_id` but no `previous_version_id` chain → invalid (lineage members MUST form a chain).
- Skipped version numbers (v1, v3 without v2) → invalid.
- Branching artifact history (v2a and v2b both pointing at v1) → out of scope for this version. Each artifact has at most one `previous_version_id`. To represent branching, future extensions MAY introduce a separate construct.
- Artifact with no extension fields at all → unaffected; the extension's rules do not apply.

---

## Example: linear version chain

```json
{
  "uacp": "0.6.0",
  "id": "conv-artifact-versioned",
  "tool": "claude",
  "extensions": ["uacp-artifacts"],
  "messages": [
    { "role": "user", "content": "Write an SVG circle." },
    {
      "role": "assistant",
      "content": [{ "type": "artifact_ref", "id": "art-svg-1" }],
      "artifacts": [
        {
          "id": "art-svg-1",
          "type": "svg",
          "title": "circle.svg",
          "content": "<svg ...><circle ... fill=\"blue\"/></svg>",
          "version": 1,
          "artifact_lineage_id": "lin-circle"
        }
      ]
    },
    { "role": "user", "content": "Make it red." },
    {
      "role": "assistant",
      "content": [{ "type": "artifact_ref", "id": "art-svg-2" }],
      "artifacts": [
        {
          "id": "art-svg-2",
          "type": "svg",
          "title": "circle.svg",
          "content": "<svg ...><circle ... fill=\"red\"/></svg>",
          "version": 2,
          "artifact_lineage_id": "lin-circle",
          "previous_version_id": "art-svg-1"
        }
      ]
    }
  ]
}
```

---

## Out of scope

- Diff representation between versions (consumer concern; could be a future extension).
- Cross-conversation artifacts.
- Branching artifact history (multiple `version: 2` artifacts diverging from a single `version: 1`).

---

## Extension declaration

```json
{ "extensions": ["uacp-artifacts"] }
```

The core `artifact` object remains valid without these fields. Declaring this extension signals that artifacts in the document carry version-chain semantics.

Consumers that do not understand this extension MAY ignore `artifact_lineage_id`, `previous_version_id`, and `immutable` and treat each artifact as standalone.
