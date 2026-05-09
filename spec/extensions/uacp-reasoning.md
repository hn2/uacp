# uacp-reasoning — Reasoning Blocks Extension

**Status:** Available
**Version:** 0.3.2
**Identifier:** `uacp-reasoning`
**Schema:** `schema/extensions/uacp-reasoning.schema.json`
**Conformance level:** L3 (additive)

---

## Purpose

`uacp-reasoning` represents model reasoning content as a distinct content block type with visibility metadata. It captures extended-thinking traces produced by Anthropic Claude (extended thinking), OpenAI o-series models, Gemini thinking, and similar reasoning-enabled models.

Reasoning content is distinct from the visible response: it is the model's internal scratchpad and may or may not be surfaced to the user.

---

## Schema patch (additive)

A new content block type, `thinking`, is added to the `content[]` array of any message:

```json
{
  "type": "thinking",
  "text": "<reasoning text>",
  "model_visibility": "visible | hidden | redacted",
  "tokens": 0
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string `"thinking"` | yes | Block discriminator. |
| `text` | string (≤ 1,000,000 Unicode codepoints) | yes | The reasoning content. May be empty string if the model returned a zero-length thinking block. |
| `model_visibility` | enum: `visible`, `hidden`, `redacted` | no | Whether the vendor surfaced this content. Default `visible`. |
| `tokens` | integer ≥ 0 | no | Token count for this block, if vendor-reported. |

The `model_visibility` semantics:
- `visible` — the vendor included reasoning in the model output by default and the user is expected to see it.
- `hidden` — the vendor produced reasoning but did not surface it; the consumer obtained it via a separate channel (audit log, debug API).
- `redacted` — the vendor returned a redacted summary in place of the full reasoning; round-trip preserves the redaction marker rather than the original text.

---

## Placement

`thinking` blocks are entries in `message.content[]` (which becomes the array form of message content). Order in `content[]` reflects model emission order. A `thinking` block MAY appear before, after, or interleaved with `text`, `tool_use`, and other content block types.

---

## Semantics

- Consumers that do not render reasoning SHOULD skip `thinking` blocks but MUST preserve them across round-trips.
- `redacted` blocks MUST be preserved across round-trips (the redacted summary is the canonical representation; the lossy fact is acknowledged).
- The order of content blocks is significant: a consumer rendering reasoning MUST display it in the order received.

---

## Validation rules (normative)

A validator that claims `uacp-reasoning` conformance MUST reject a document if any of the following hold for any `thinking` block:

1. `text` is missing or not a string.
2. `text` exceeds 1,000,000 Unicode codepoints.
3. `model_visibility` is present and is not one of `visible`, `hidden`, `redacted`.
4. `tokens` is present and is not a non-negative integer.

Validators MUST return errors in the standard `{ valid: false, errors: [{ path, code, message }] }` shape.

---

## Edge cases

- Vendor omits `tokens` → permitted; consumers MUST NOT compute cost from a missing `tokens` field.
- Vendor returns reasoning interleaved with `tool_use` blocks → preserve order.
- `text` is the empty string but the block exists (vendor returned an empty thinking block) → permitted; some validators MAY warn but MUST NOT reject.

---

## Example: Anthropic extended thinking

```json
{
  "uacp": "0.6.0",
  "id": "conv-thinking-001",
  "tool": "claude",
  "extensions": ["uacp-reasoning"],
  "messages": [
    { "role": "user", "content": "Is 17 prime?" },
    {
      "role": "assistant",
      "content": [
        {
          "type": "thinking",
          "text": "17 — check divisibility by 2 (no), 3 (no); the square root is ~4.1 so I only need to check up to 4. Not divisible by 2 or 3. Therefore prime.",
          "model_visibility": "hidden",
          "tokens": 34
        },
        { "type": "text", "text": "Yes, 17 is a prime number." }
      ]
    }
  ]
}
```

---

## Example: redacted reasoning

```json
{
  "uacp": "0.6.0",
  "id": "conv-thinking-redacted",
  "tool": "openai",
  "extensions": ["uacp-reasoning"],
  "messages": [
    { "role": "user", "content": "Solve 3x+7=22." },
    {
      "role": "assistant",
      "content": [
        { "type": "thinking", "text": "[redacted summary: arithmetic chain]", "model_visibility": "redacted" },
        { "type": "text", "text": "x = 5" }
      ]
    }
  ]
}
```

---

## Out of scope

- Structured chain-of-thought (sub-steps, reasoning graphs). Thinking is opaque text in this version.
- Cross-vendor reasoning normalization. The extension preserves vendor output as-is.

---

## Extension declaration

```json
{ "extensions": ["uacp-reasoning"] }
```

Consumers that do not understand this extension MAY ignore `thinking` blocks; the visible response (`type: "text"` blocks) remains intact.
