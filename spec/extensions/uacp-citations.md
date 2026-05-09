# uacp-citations — Per-Claim Citations Extension

**Status:** Available
**Version:** 0.3.3
**Identifier:** `uacp-citations`
**Schema:** `schema/extensions/uacp-citations.schema.json`
**Conformance level:** L3 (additive)

---

## Purpose

`uacp-citations` captures per-claim source citations on assistant messages with source kinds, retrieval metadata, and span/selector/page anchoring. It models the citation patterns produced by Perplexity, Anthropic Claude (Use search / web tool), OpenAI structured citations, and similar retrieval-augmented systems.

Core UACP supports a minimal `citations` array (`span` + `source.url`). This extension adds the full semantics: source kinds, RFC 3339 retrieval timestamps, and three anchor forms.

---

## Schema patch (additive)

Each item in `message.citations[]` is an object:

```json
{
  "source": { "kind": "web|document|vector_store|tool_result|user_attachment", "url": "...", "title": "...", "publisher": "...", "id": "..." },
  "retrieved_at": "2026-05-09T12:00:00Z",
  "anchor": { "start": 0, "end": 16 },
  "confidence": 0.95
}
```

### Source

| Field | Type | Required | Description |
|---|---|---|---|
| `source.kind` | enum: `web`, `document`, `vector_store`, `tool_result`, `user_attachment` | yes | The class of source. |
| `source.url` | string (https/http) | no | Canonical URL of the source. |
| `source.title` | string (≤ 1024) | no | Title of the cited page or document. |
| `source.publisher` | string (≤ 256) | no | Publishing entity. |
| `source.id` | string (≤ 256) | no | Vendor-specific source identifier (vector store id, attachment id, etc.). |

### Retrieval timestamp

| Field | Type | Required | Description |
|---|---|---|---|
| `retrieved_at` | string (RFC 3339 / ISO 8601) | required when `source.kind = "web"`; optional otherwise | When the source content was retrieved by the model or tool. |

### Anchor

`anchor` identifies where in the cited message text the citation applies. Exactly one of three forms MUST be present (`oneOf`):

| Form | Required keys | Notes |
|---|---|---|
| Codepoint offsets | `start`, `end` | Unicode codepoint offsets (NOT bytes, NOT UTF-16 code units, NOT grapheme clusters) into the message's primary text content. `end` MUST be ≥ `start`. |
| CSS selector | `selector` | Non-empty string identifying a fragment within rendered HTML. |
| Page | `page` | 1-based page number for paged sources (PDF, EPUB). Integer ≥ 1. |

### Confidence

| Field | Type | Required | Description |
|---|---|---|---|
| `confidence` | number 0.0–1.0 | no | Model's self-reported confidence that the source supports the claim. |

---

## Placement

Citations are entries in `message.citations[]` (an array on the message object). The flattened text of `message.content` (concatenated `text` blocks in order, or the message string itself if `content` is a string) is the substrate for codepoint offsets.

---

## Semantics

- Codepoint offsets count Unicode scalar values across the flattened text, equivalently `Array.from(text).length` in JavaScript or iteration over a Python `str`.
- `anchor.end` MUST be greater than or equal to `anchor.start`. `end == start` denotes a zero-width anchor (cursor position).
- Citations MAY overlap (multiple sources for the same span).
- A source with `url` but `kind: "document"` is permitted (the document URL is meaningful).
- `retrieved_at` precision is implementation-defined within RFC 3339 bounds; consumers MUST NOT rely on sub-second precision being preserved.

---

## Validation rules (normative)

A validator that claims `uacp-citations` conformance MUST reject a document if, for any citation that uses the extension form (any citation with `anchor` or with `source.kind`):

1. `source` is missing or not an object.
2. `source.kind` is missing or not one of the enumerated values.
3. `source.kind == "web"` and `retrieved_at` is missing.
4. `retrieved_at` is present and not a valid RFC 3339 datetime string.
5. `anchor` is missing.
6. `anchor` does not satisfy exactly one of the three forms (codepoint offsets, selector, page).
7. `anchor.end < anchor.start` (when codepoint form is used).
8. `anchor.start` or `anchor.end` exceeds the codepoint length of the flattened message text.
9. `anchor.page < 1`.
10. `confidence` is present and not a number in `[0, 1]`.

Validators MUST return errors in the standard `{ valid: false, errors: [{ path, code, message }] }` shape.

---

## Edge cases

- Codepoint offset past end of text → invalid.
- Citation without `confidence` → permitted (field optional).
- Source with `url` but `kind: "document"` → permitted.
- Mixed citation forms in a single conversation (some citations using core `span`, others using extension `anchor`) → permitted; validators apply extension rules only to citations using the extension form.

---

## Example: web citation with retrieved_at + start/end

```json
{
  "uacp": "0.6.0",
  "id": "conv-cite-001",
  "tool": "perplexity",
  "extensions": ["uacp-citations"],
  "messages": [
    { "role": "user", "content": "What is the speed of light?" },
    {
      "role": "assistant",
      "content": "The speed of light in a vacuum is approximately 299,792,458 metres per second.",
      "citations": [
        {
          "source": {
            "kind": "web",
            "url": "https://physics.nist.gov/cgi-bin/cuu/Value?c",
            "title": "NIST — Speed of light in vacuum",
            "publisher": "NIST"
          },
          "retrieved_at": "2026-05-09T12:00:00Z",
          "anchor": { "start": 0, "end": 78 },
          "confidence": 0.99
        }
      ]
    }
  ]
}
```

---

## Example: document citation with page anchor

```json
{
  "source": { "kind": "document", "title": "Owner's Manual", "id": "doc-abc" },
  "anchor": { "page": 42 }
}
```

## Example: tool_result citation with selector

```json
{
  "source": { "kind": "tool_result", "id": "search-result-7" },
  "anchor": { "selector": "#section-2 > p:nth-child(3)" }
}
```

---

## Out of scope

- Inline citation rendering conventions (consumer concern).
- Cross-message citations (a citation in message A pointing to message B).

---

## Extension declaration

```json
{ "extensions": ["uacp-citations"] }
```

The core `citations` array remains valid in its core form (`span` + `source.url`). Declaring this extension signals that the full citation semantics (source kinds, retrieved_at, three anchor forms) are present.

Consumers that do not understand this extension MAY ignore the `citations` array entirely.
