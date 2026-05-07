# uacp-privacy — Privacy Taxonomy Extension

**Status:** Optional extension  
**Version:** 0.5.0  
**Identifier:** `uacp-privacy`

---

## Overview

`uacp-privacy` is an optional UACP extension that defines a vendor-neutral way to attach privacy classification to a conversation document.

Privacy is NOT a core UACP concern. Different products have different privacy taxonomies: FusionLayer uses Smart/Private/Incognito modes, ChatGPT has Temporary Chat, Anthropic has Projects. A protocol should not dictate the privacy model.

This extension provides a reference taxonomy and a recommended metadata placement for implementations that want interoperable privacy classification.

---

## Declaring the extension

Implementations that use this extension MUST declare it in the top-level `extensions` array:

```json
{
  "uacp": "0.5.0",
  "id": "conv_abc",
  "tool": "my-tool",
  "extensions": ["uacp-privacy"],
  "messages": [...],
  "metadata": {
    "uacp_privacy.level": "personal"
  }
}
```

---

## Metadata field

Privacy level is stored under the metadata key `uacp_privacy.level`. The value is a string.

**Recommended placement:** `metadata.uacp_privacy.level` on the conversation object.

```json
"metadata": {
  "uacp_privacy.level": "personal"
}
```

---

## Reference taxonomy

This taxonomy is a REFERENCE, not a requirement. Implementations MAY use it as-is, adapt it, or replace it with a vendor-namespaced taxonomy.

| Level | Suggested meaning | Typical sync behavior |
|-------|-------------------|-----------------------|
| `private` | Local only, never transmitted | No sync |
| `personal` | User's own devices only | Encrypted sync |
| `team` | Visible to team/group members | Group-key encrypted sync |
| `public` | Anyone with the link | Public share link |

**Default (when field is absent):** `personal` (recommended; implementations MAY choose a different default).

---

## Vendor-namespaced alternatives

Implementations with product-specific privacy models SHOULD use a vendor namespace instead of (or in addition to) `uacp_privacy.level`:

```json
"metadata": {
  "com.fusionlayer.privacy_mode": "smart",
  "com.myproduct.privacy_tier": "restricted"
}
```

This avoids conflating product-specific semantics with the reference taxonomy.

---

## Scope

This extension covers only privacy *classification* — how a conversation is labeled. It does NOT define:

- Encryption at rest or in transit (see `uacp-encryption` extension)
- Access control lists or sharing mechanisms
- Enforcement policy (implementation-specific)

---

## Related

- Core spec: `README.md` §10 (Extensibility)
- Encryption envelope: `spec/extensions/uacp-encryption.md`
- CONFORMANCE.md: L2+ extension conformance
