# UACP-Memory — Kind Specification v1

**Kind:** `memory`
**Schema version:** 1
**Status:** Draft

---

## §1 — Kind and Version

| Field           | Value    |
|-----------------|----------|
| kind            | `memory` |
| schema_version  | 1        |
| uacp_version    | 1        |

---

## §2 — Purpose

A `memory` artifact encodes a single persistent fact, preference, or piece of recalled context about a user. Memories cross vendor boundaries so an AI system that learns something about the user can share that knowledge with other AI systems — without re-learning it on every session.

**Scope:** `memory` is for facts that need to persist across sessions and vendors. It is NOT for ephemeral session state, chat history, or model-internal context.

---

## §3 — Body Schema

```jsonc
{
  "content": "string (required, ≤2000 chars)",
  "category": "personal | professional | preference | health | relationship | financial | <custom>  (optional)",
  "confidence": "number 0.0–1.0 (optional, default 1.0)",
  "source": "string — tool or session that produced this memory (optional)",
  "expires_at": "ISO 8601 datetime string (optional, null = never expires)"
}
```

### Field rules

| Field       | Type             | Required | Constraints                        |
|-------------|------------------|----------|------------------------------------|
| content     | string           | YES      | ≤2000 characters, non-empty        |
| category    | string enum      | NO       | See category values below          |
| confidence  | number           | NO       | 0.0 ≤ value ≤ 1.0; default 1.0    |
| source      | string           | NO       | ≤256 characters                    |
| expires_at  | ISO 8601 string  | NO       | MUST be a future datetime at creation time |

### Category values

| Value          | Meaning                                               |
|----------------|-------------------------------------------------------|
| `personal`     | Personal details, name, family, location              |
| `professional` | Job, company, role, industry                          |
| `preference`   | Behavioral preferences, style, format                 |
| `health`       | Health conditions, medication, dietary needs          |
| `relationship` | Social connections, contacts                          |
| `financial`    | Budget constraints, payment methods, financial goals  |
| `<custom>`     | Vendor-prefixed custom category, e.g. `acme/project`  |

Custom categories MUST use the `<vendor>/<name>` format to avoid collisions.

---

## §4 — Complete Example

```yaml
uacp_version: 1
kind: memory
id: a1b2c3d4-1234-5678-abcd-ef0123456789
schema_version: 1
version: 1.0.0
author: "@alice"
created_at: "2026-05-16T09:00:00Z"
description: User's primary programming stack
tags:
  - professional
  - technology
signature: "sha256:5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
body:
  content: "I am a senior TypeScript developer. My primary stack is Node.js, React, and PostgreSQL."
  category: professional
  confidence: 1.0
  source: "claude-code/session-2026-05-16"
  expires_at: null
```

---

## §5 — Notes

- Implementations MUST NOT store health or financial memories without explicit user consent.
- When `confidence` < 0.7, receiving implementations SHOULD treat the memory as low-confidence and avoid surfacing it without verification.
- Content SHOULD be written in first person from the user's perspective (e.g., "I am...", "My preference is...").
- Empty `content` is invalid. An implementation receiving an empty-content memory MUST reject it.
- `expires_at` applies to the artifact's usefulness; the artifact envelope itself is immutable after signing.
