# UACP Core Specification v1

**Universal AI Context Protocol (UACP) — Core Specification**

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**,
**SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be
interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in
all capitals.

Sections labelled **(informative)** are explanatory and do not contain normative
requirements. All other sections are normative.

---

## §1 — Scope and Definition of "Context"

In UACP (Universal AI Context Protocol), **context** means data that needs to move
between AI systems to preserve a user's experience: their memory, their preferences,
their policies, their citations, their workflows, and the audit trail of what each system
did. UACP does NOT describe how any one AI system internally executes — its routing,
caches, prompt templates, model versions, or operator code are out of scope. UACP
describes what *crosses the wire between vendors*; engines describe what happens *inside
the wire*.

### Anti-patterns

- Do NOT define context as "chat history only" — that is too narrow. UACP context
  includes memory, policy, personas, redaction rules, source citations, themes,
  traces, packs, and playbooks, among other kinds.
- Do NOT define context as "all AI state" — that is too broad. Internal engine state
  (routing decisions, prompt templates, model selection, operator pipelines) is
  explicitly out of scope.

---

## §2 — Layer Model

UACP is one layer in a three-layer model.

| Layer        | Name       | Defined by           | Description                                                                 |
|--------------|------------|----------------------|-----------------------------------------------------------------------------|
| **L1**       | UACP       | This specification   | Envelope format, kind registry, signing, versioning, compliance.            |
| **L2**       | Artifact   | Per-kind sub-specs   | The `body` of each artifact kind (memory, policy, persona, trace, …).       |
| **L3**       | Operator   | Engine implementation | How artifacts are stored, fetched, injected, and transformed inside an engine. |

**Critical note:** UACP does not define operators. UACP defines what flows *into* and
*out of* an operator. An operator's internal behavior — its pipeline, latency targets,
caching strategy, prompt construction — is entirely outside the scope of this
specification.

**Note for Kubernetes readers:** UACP Operator (an engine-side concept) is NOT the
Kubernetes Operator pattern. In UACP, operators are stateless transformations over
Artifacts.

---

## §3 — Kind Registry

UACP defines a blessed set of core artifact kinds. Each kind has a dedicated sub-spec
issue that normatively defines its `body` field.

### Core kinds

| Kind                | Sub-spec link                       | Status  | Description                                         |
|---------------------|-------------------------------------|---------|-----------------------------------------------------|
| `memory`            | `spec/v1/kinds/MEMORY.md`           | Draft   | Persistent facts, preferences, and recalled context |
| `policy`            | `spec/v1/kinds/POLICY.md`           | Draft   | Rules and constraints the engine must enforce       |
| `guideline`         | `spec/v1/kinds/GUIDELINE.md`        | Draft   | Soft instructions and style preferences             |
| `persona`           | `spec/v1/kinds/PERSONA.md`          | Draft   | Identity, voice, and behavioral configuration       |
| `redaction-pattern` | `spec/v1/kinds/REDACTION-PATTERN.md`| Draft   | Patterns used to redact sensitive content           |
| `source`            | `spec/v1/kinds/SOURCE.md`           | Draft   | Citation and reference material                     |
| `theme`             | `spec/v1/kinds/THEME.md`            | Draft   | Visual or tonal configuration                       |
| `trace`             | `spec/v1/kinds/TRACE.md`            | Draft   | Audit record of engine actions                      |
| `pack`              | `spec/v1/kinds/PACK.md`             | Draft   | A named collection of related artifacts             |
| `playbook`          | `spec/v1/kinds/PLAYBOOK.md`         | Draft   | A sequenced workflow of actions or instructions     |

### Extension kinds

Vendors and operators MAY define custom kinds that are not in the core registry. The
following rules apply:

- Custom kinds MUST be namespaced using the form `'<vendor>/<name>'`
  (e.g., `'acme/chain-of-thought'`).
- Core kinds are unnamespaced (e.g., `memory`, `policy`).
- Implementations that encounter an unknown kind MUST pass through the artifact without
  modification. Implementations MUST NOT reject or drop artifacts solely because their
  kind is unrecognized.

---

## §4 — Envelope Format (informative)

This section is informative. The normative schema is `spec/v1/envelope.schema.json`.

Every UACP artifact is wrapped in a common envelope. The envelope provides routing
metadata, provenance, and integrity information that is independent of artifact content.
Sub-specs define the `body` field only; they MUST NOT redefine or override any
top-level envelope field.

### Minimum YAML envelope

```yaml
uacp_version: 1
kind: <one of §3, or a namespaced custom kind>
id: <stable identifier or UUID>
schema_version: 1
version: 1.0.0
author: <handle or DID>
created_at: <iso8601>
signature: <hash or ed25519>
body: <kind-specific, defined by the sub-spec>
```

### Optional top-level fields

| Field         | Type            | Description                                                  |
|---------------|-----------------|--------------------------------------------------------------|
| `description` | string          | Human-readable summary of the artifact's purpose            |
| `tags`        | array of string | Free-form labels for search and filtering                    |
| `audience`    | string          | Intended consumer (e.g., a vendor handle or `*` for public) |
| `license`     | string          | SPDX identifier or `proprietary`                            |
| `marketplace` | object          | Marketplace listing metadata (reserved for future use)      |

### Authoring rules

- `id` MUST be stable across updates to the same artifact. Use a UUID v4 on first
  creation and preserve it in all subsequent revisions.
- `created_at` MUST be an ISO 8601 timestamp in UTC.
- `version` MUST follow semantic versioning (semver). Revisions to the same artifact
  MUST increment at least the patch component.

---

## §5 — Signing and Trust

### V1: Hash-only signing

In V1, signing uses a SHA-256 hash of the artifact envelope.

**Computing the signature:**

1. Serialize the full envelope to canonical JSON (keys sorted lexicographically,
   no extra whitespace).
2. Remove the `signature` field from the serialized object.
3. Compute `sha256(<canonical-JSON-bytes>)` and encode as lowercase hexadecimal.
4. Set `signature: sha256:<hex>`.

**Verification:**

1. Parse the envelope.
2. Extract the `signature` value.
3. Remove the `signature` field from the parsed object.
4. Serialize to canonical JSON (same rules as above).
5. Compute SHA-256 and compare to the extracted hex digest.

### V2 (deferred): ed25519 signatures

V2 will support ed25519 signatures with author public keys distributed via
signed registries. V2 signature values will use the form `ed25519:<base64>`.
V2 is deferred pending the key-registry sub-spec.

### Trust model

- Implementations MUST validate SHA-256 hashes when a `signature` field starting
  with `sha256:` is present.
- Implementations MUST reject artifacts whose computed hash does not match the
  declared hash.
- Implementations SHOULD warn the operator when an artifact has no `signature` field.
- Implementations MAY allow unsigned artifacts in development mode.

---

## §6 — Versioning Policy

UACP uses three independent version fields.

| Field            | Scope              | When incremented                                               | Stability target            |
|------------------|--------------------|----------------------------------------------------------------|-----------------------------|
| `uacp_version`   | Envelope semantics | Only when the envelope format has a breaking change            | >= 12 months between breaks |
| `schema_version` | Sub-spec payload   | When a kind's `body` schema has a non-backwards-compatible change | Defined per sub-spec        |
| `version`        | Artifact instance  | Semver; increment at least patch on every revision             | Defined per artifact        |

**Compatibility rules:**

- Implementations that encounter `uacp_version` greater than their highest supported
  version MUST refuse to process the artifact and MUST surface an error to the caller.
  They MUST NOT silently discard or partially process such artifacts.
- Implementations SHOULD document which `uacp_version` values they support.
- Adding a new optional envelope field is NOT a breaking change and does NOT require
  incrementing `uacp_version`.
- Sub-specs MAY add optional `body` fields in a minor `schema_version` increment.
  Removing or renaming fields MUST increment `schema_version`.

---

## §7 — Compliance Levels (informative)

This section is informative. Compliance claims are voluntary and self-reported.

### Compliance string format

Compliance is expressed as a `+`-separated list of compliance tokens:

```
UACP-Core@1 + UACP-Memory@1 + UACP-Persona@1
```

### Capability axes

Each compliance token MAY be qualified by one or more capability axes in brackets:

| Axis        | Meaning                                                       |
|-------------|---------------------------------------------------------------|
| `Read`      | Can parse and consume artifacts of this kind                  |
| `Write`     | Can produce valid artifacts of this kind                      |
| `Operate`   | Can transform or inject artifacts of this kind in a pipeline  |

**Example:** `UACP-Memory@1 [Read, Write]` means the implementation can parse and
produce `memory` artifacts at schema version 1.

### Baseline requirement

An implementation claiming `UACP-Core@1` compliance MUST:

- Correctly parse envelopes with all required fields.
- Validate SHA-256 signatures when present.
- Pass through artifacts of unknown kinds without modification.
- Refuse artifacts with `uacp_version` greater than 1.

---

## §8 — Out of Scope (informative)

This section is informative and enumerates topics that are explicitly not addressed by
this specification. Implementors are free to define their own approaches to these topics.

- **Operator definitions** — how an engine implements injection, transformation, or
  routing of UACP artifacts.
- **Routing strategy** — which artifacts are delivered to which model, in what order,
  and under what conditions.
- **Orchestration and pipeline state** — multi-step workflow execution, agent loops,
  or chain-of-thought state.
- **Cost and billing** — token accounting, rate limiting, or metering.
- **Model versions and prompt templates** — which language model is invoked or how
  system prompts are constructed.
- **Network transport** — HTTP, WebSocket, gRPC, or any other transport mechanism.
  UACP describes artifact content, not how artifacts move between systems.
