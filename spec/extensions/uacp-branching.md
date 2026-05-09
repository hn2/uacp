# uacp-branching — Conversation Branching Extension

**Status:** Available
**Version:** 0.3.1
**Identifier:** `uacp-branching`
**Schema:** `schema/extensions/uacp-branching.schema.json`
**Conformance level:** L3 (additive)

---

## Purpose

`uacp-branching` represents conversational branches — regenerations, edits, and alternative responses — as siblings of a shared parent message. Linear UACP captures one path through a conversation; this extension preserves the full tree.

This pattern appears in ChatGPT (message edit + regenerate), Claude (edit message), and similar interfaces.

---

## Schema patch (additive)

Two optional fields are added to each `message` object:

| Field | Type | Description |
|---|---|---|
| `branch_parent_id` | string (1–256) | The `id` of the message this branch diverges from. MUST reference an existing message in the same conversation. MUST NOT be the same as the message's own `id`. |
| `branch_label` | string (≤ 256) | Human-readable label for this branch (e.g. `"regeneration 1"`, `"edited-question"`, `"shorter"`). |

Both fields are placed directly on the message object alongside `role`, `content`, `id`, etc.

---

## Semantics

- A message with `branch_parent_id` is a **sibling** of the message identified by that id; both share the same logical parent (or both are roots, when the divergence happens at the user-side prompt).
- Consumers MAY render the branch tree linearly by selecting one branch per fork; consumers SHOULD preserve all branches in storage.
- A branch's children (subsequent messages that reference it via `parent_id`) form their own subtree; branches do not share children.
- `branch_label` is advisory metadata only. It does not affect tree topology.

---

## Validation rules (normative)

A validator that claims `uacp-branching` conformance MUST reject a document if any of the following hold:

1. A `branch_parent_id` value does not match the `id` of any message in the same `messages` array (dangling reference).
2. A `branch_parent_id` value equals the message's own `id` (self-reference).
3. The graph formed by `branch_parent_id` pointers contains a cycle (i.e., following pointers from a message returns to that message).
4. `branch_label` exceeds 256 characters.

Validators MUST return errors in the standard `{ valid: false, errors: [{ path, code, message }] }` shape.

---

## Edge cases

- A document that uses branching fields but does not declare `"uacp-branching"` in its `extensions[]` is still well-formed against core UACP. Consumers without extension support SHOULD treat the fields as opaque metadata and MUST NOT crash.
- Multiple branch roots (a user regenerates a user-side prompt) are permitted; both branched messages share the same logical parent (or both are roots).
- A linear sequence of messages (no `branch_parent_id` anywhere) is unaffected.

---

## Example: ChatGPT-style edit and regenerate

```json
{
  "uacp": "0.6.0",
  "id": "conv-branch-001",
  "tool": "chatgpt",
  "extensions": ["uacp-branching"],
  "messages": [
    { "id": "m1", "role": "user",      "content": "What is 2+2?" },
    { "id": "m2", "role": "assistant", "content": "4" },
    { "id": "m3", "role": "user",      "content": "What is 2+3?",
      "branch_parent_id": "m1", "branch_label": "edited-question" },
    { "id": "m4", "role": "assistant", "content": "5",
      "branch_parent_id": "m2", "branch_label": "edited-question" }
  ]
}
```

---

## Example: multiple regenerations

```json
{
  "uacp": "0.6.0",
  "id": "conv-branch-regen",
  "tool": "claude",
  "extensions": ["uacp-branching"],
  "messages": [
    { "id": "m1", "role": "user",      "content": "Write a haiku about rain." },
    { "id": "m2", "role": "assistant", "content": "Soft drops on the glass / silver lines race each other / the garden drinks deep",
      "branch_label": "attempt-1" },
    { "id": "m3", "role": "assistant", "content": "Rain taps the window / puddles mirror the grey sky / frogs wake and rejoice",
      "branch_parent_id": "m1", "branch_label": "attempt-2" }
  ]
}
```

---

## Out of scope

- UI rendering conventions (consumer concern).
- Cross-conversation branching (branches are intra-conversation only).

---

## Extension declaration

```json
{ "extensions": ["uacp-branching"] }
```

Consumers that do not understand this extension MAY ignore `branch_parent_id` and `branch_label` and render the conversation as a flat linear sequence.
