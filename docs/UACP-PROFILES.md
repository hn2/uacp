# UACP Profiles and Implementation Adapters

**Status:** Normative guidance  
**Scope:** Clarifies the boundary between core UACP and product-specific extensions

---

## Purpose

UACP defines a vendor-neutral interchange format for AI conversation data. Real implementations need additional semantics — privacy modes, product-specific routing policies, UX metadata — that have no place in the core protocol.

This document defines:
1. What belongs in core UACP
2. What belongs in a **UACP Profile**
3. How to write and publish a Profile
4. Migration guidance for existing product-specific fields

---

## 1. Core UACP vs Profile Boundary

### Belongs in Core UACP

A field or rule belongs in core UACP **if and only if** it can be validated from a standalone UACP JSON document without knowledge of any particular implementation.

| Category | Examples |
|----------|---------|
| Conversation data model | messages, roles, content blocks, attachments |
| Identity and provenance | `conversation_id`, `turn_id`, timestamps, tool call IDs |
| Message structure | branch topology, thread references |
| Multimodal content | image/audio/file references and encoding |
| Citation and grounding | `span`, `source_uri`, `confidence` |
| Schema validation constraints | required fields, type constraints, format rules |

### Belongs in a Profile

A field or rule belongs in a Profile if it:
- Depends on a specific product's runtime decisions
- Requires knowledge of routing policy, cost models, or UX behavior
- Is meaningful only within one implementation ecosystem

| Category | Examples |
|----------|---------|
| Vendor/model selection | `preferred_vendor`, `model_pin`, routing tier |
| Cost and billing policy | per-call caps, budget attribution, plan-level gates |
| Storage policy | blob storage back-end, encryption key IDs |
| Product metadata | persona identifiers, workspace IDs, team slugs |
| UX state | draft status, thread collapse state, UI theme |
| Execution strategy | single / debate / council / pipeline mode |

---

## 2. What is a Profile?

A **Profile** is a named extension document that specifies additional fields and semantics on top of core UACP. A compliant Profile:

- MUST define a `$id` URI (e.g., `https://fusionlayer.app/uacp-profile/v1`)
- MUST specify which UACP version it extends
- MUST place all product-specific fields under a dedicated namespace key inside the core `metadata` object (e.g., `metadata["x-fusionlayer"]`, `metadata["x-cursor"]`, `metadata["x-yourproduct"]`) — `metadata` is the only place in `conversation.schema.json` where arbitrary additional properties are permitted; the document root has `unevaluatedProperties: false` and rejects unknown top-level keys, including `x-*` ones
- MUST NOT redefine core UACP fields
- MUST document which fields are required vs optional within the profile
- SHOULD provide JSON Schema for profile-specific fields
- SHOULD document interoperability behavior: what a non-profile-aware consumer sees

### Example Profile Declaration

```json
{
  "uacp": "0.6.0",
  "id": "conv_01j8x3z9k4h7m6n5p2q1r0s9t8",
  "tool": "inkfold",
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "metadata": {
    "x-fusionlayer": {
      "profile": "https://fusionlayer.app/uacp-profile/v1",
      "storage_mode": "private",
      "persona_id": "inkfold-default",
      "routing_vendor": "anthropic",
      "cost_usd": 0.0024
    }
  }
}
```

A consumer that does not understand `metadata["x-fusionlayer"]` MUST ignore it and process the conversation using only core UACP fields. Because `metadata` already permits arbitrary additional properties, this is satisfied automatically — no stripping is required for the document to remain schema-valid.

---

## 3. Standard Namespace Convention

Profile implementors MUST use the `x-` prefix convention, nested under the core `metadata` object:

```
metadata["x-{vendor}"]          FusionLayer:  metadata["x-fusionlayer"]
                                Cursor:       metadata["x-cursor"]
                                Your product: metadata["x-yourproduct"]
```

Keys inside the namespace are free-form but SHOULD follow the same naming conventions as core UACP (snake_case, descriptive names).

---

## 4. Example Mapping Table

The table below shows how FusionLayer-specific fields map to the profile pattern:

| FusionLayer concept | Core UACP field | Profile field |
|--------------------|-----------------|---------------|
| Storage / sharing mode | — | `metadata["x-fusionlayer"].privacy_mode` (product-specific; core has the optional `metadata.uacp_privacy.level` convention only) |
| Active AI persona | — | `metadata["x-fusionlayer"].persona_id` |
| Vendor selection | — | `metadata["x-fusionlayer"].routing_vendor` |
| Cost per message | — | `metadata["x-fusionlayer"].cost_usd` |
| Pseudonymizer mode | — | `metadata["x-fusionlayer"].pseudonymizer_mode` |
| Team / workspace | — | `metadata["x-fusionlayer"].workspace_id` |
| Plan tier | — | `metadata["x-fusionlayer"].plan` |

---

## 5. Interoperability Rule

A UACP document that carries a Profile namespace extension MUST remain valid against the core UACP schema after stripping the profile's `metadata["x-*"]` keys. Because `metadata` already permits arbitrary additional properties, this holds by construction — the check below is a sanity guard, not a workaround. Implementors MUST verify this with the repo's validator:

```bash
# Strip the x- namespace from metadata and validate against core schema
jq 'del(.metadata["x-fusionlayer"])' input.json > /tmp/stripped.json
node validate.js /tmp/stripped.json
```

---

## 6. Publishing a Profile

A Profile document SHOULD be published at a stable HTTPS URL matching its `$id`. The document SHOULD include:

- Profile identifier and version
- Parent UACP version compatibility
- Full field reference (name, type, required/optional, semantics)
- JSON Schema for all profile-specific fields
- Example document

Profiles MAY be registered in the UACP community profile registry (see CONTRIBUTING.md) to aid discovery. Registration is voluntary and does not imply endorsement.

---

## 7. Migration Guidance

### Moving existing product fields to a Profile

If your implementation currently embeds product-specific fields directly in UACP documents (without the `x-` namespace):

1. Identify all product-specific fields via `diff` against the core schema
2. Move them under `x-yourproduct` in a versioned profile document
3. Update your read path: read `x-yourproduct.*` with fallback to legacy top-level keys
4. Update your write path: emit only `x-yourproduct.*` going forward
5. After a migration window, drop the legacy fallback

### Graduating a field from Profile to Core

A Profile field MAY be proposed for inclusion in core UACP if:
- Multiple independent implementations adopt the same field with the same semantics
- The field can be validated without runtime context
- The field benefits interoperability across tools

Submit a proposal via the UACP issue tracker with implementation evidence from at least two independent products.
