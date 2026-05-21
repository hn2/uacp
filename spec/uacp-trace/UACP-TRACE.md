# UACP-Trace Specification v2 (Draft)

**Universal AI Context Protocol — Trace Specification**

> **Status:** Draft v2 — OTel gen_ai profile + `uacp.*` extension layer.
> Supersedes the `trace` kind that was part of UACP-Core v1 (now removed in UACP-Core v0.2 per ADR 0038).
> Tracked in [hn2/uacp#82](https://github.com/hn2/uacp/issues/82).

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**,
**SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be
interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in
all capitals.

---

## §1 — Overview

UACP-Trace defines how AI execution traces are represented and transmitted in a way that
is interoperable with UACP context artifacts and compliant with the UACP privacy model.

UACP-Trace is a **profile of OpenTelemetry gen_ai semantic conventions** — it reuses the
OTel span model and the `gen_ai.*` attribute namespace, and adds a thin `uacp.*` extension
layer that binds traces to the UACP identity and privacy model.

### Why OTel gen_ai (not from scratch)

- 40+ auto-instrumentations already emit `gen_ai.*` spans from LangChain, LlamaIndex,
  CrewAI, Claude Agent SDK, OpenAI SDK, and others. Vendors get UACP-Trace at near-zero
  instrumentation cost.
- The gen_ai semantic conventions are now in OpenTelemetry governance (contributed by
  Traceloop), meaning they evolve via the OTel RFC process with broad industry review.
- APM backends (Datadog, Grafana, Dynatrace) are converging on `gen_ai.*`; a UACP-Trace
  collector can ingest from any of these backends without a custom receiver.

### Scope

UACP-Trace describes:
- The required and optional `uacp.*` attributes on OTel gen_ai spans
- The privacy enforcement pattern (incognito/private/smart modes)
- The collector configuration for attribute redaction

UACP-Trace does NOT describe:
- Context payloads (memory, policy, persona, etc.) — see UACP-Core
- Operator/action descriptions — see AAP
- Capture provenance — see Capture-Manifest

---

## §2 — Base: OTel gen_ai Semantic Conventions

A UACP-Trace span MUST be a valid OpenTelemetry span with at minimum:

- `gen_ai.system` — the AI system (e.g., `openai`, `anthropic`, `gemini`)
- `gen_ai.operation.name` — the operation (e.g., `chat`, `embeddings`, `rerank`)
- `gen_ai.request.model` — the model identifier

Implementations SHOULD also include:
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- `gen_ai.response.model`
- `gen_ai.prompt.*` / `gen_ai.completion.*` (when `uacp.privacy_mode = smart`)

For the full normative reference, see the
[OTel gen_ai semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

---

## §3 — UACP Extension Attributes

The following attributes extend OTel gen_ai spans. Attributes marked **REQUIRED** MUST
appear on every span that claims UACP-Trace compliance.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `uacp.privacy_mode` | enum string | REQUIRED | Privacy mode: `smart`, `private`, or `incognito`. Drives trace content and redaction behavior (see §4). |
| `uacp.subject` | string | REQUIRED | Opaque DID-style owner identifier (same semantics as UACP-Core `subject` field). |
| `uacp.audience` | string[] | REQUIRED | List of principals authorized to read this trace. Empty = subject-only. `["*"]` = public. |
| `uacp.scope` | string | REQUIRED | Scope label from UACP-Core Annex A (`individual`, `family`, `team`, `group`, `corporate`, `public`). Informational; `audience` is enforced. |
| `uacp.artifact_id` | string | optional | UACP artifact UUID/URN that this span produced or consumed. Used to link trace spans to UACP context artifacts. |
| `uacp.session_id` | string | optional | Session identifier. Maps to `traceloop.association.properties.session_id` for compatibility with OpenInference/Traceloop consumers. |
| `uacp.fanout_id` | string | optional | Groups sibling parallel-eval spans (e.g., multi-perspective evaluation runs). All spans in a fanout group share the same `uacp.fanout_id`. See §5. |
| `uacp.sensitive` | boolean | optional | When `true`, the OTel Collector MUST strip all `llm.input_messages.*` and `llm.output_messages.*` attributes before exporting. Set automatically by the privacy enforcement pattern (see §4). |

---

## §4 — Privacy Enforcement Pattern

UACP-Trace defines three enforcement levels corresponding to UACP privacy modes:

### `smart` mode (default)

Full content retention. Crowd-wisdom pipeline eligible.

```
uacp.privacy_mode = "smart"
uacp.sensitive = false (or absent)
TraceConfig: hide_inputs=False, hide_outputs=False
```

### `private` mode

Topology retained; content stripped. No crowd-wisdom contribution.

```
uacp.privacy_mode = "private"
uacp.sensitive = false (or absent)
TraceConfig: hide_inputs=True, hide_outputs=True
```

Content attributes (`gen_ai.prompt.*`, `gen_ai.completion.*`, `llm.input_messages.*`,
`llm.output_messages.*`) MUST NOT be set when `uacp.privacy_mode = "private"`.

### `incognito` mode

Nothing persists. No trace export permitted.

```
uacp.privacy_mode = "incognito"
uacp.sensitive = true
TraceConfig: hide_inputs=True, hide_outputs=True
```

When `uacp.sensitive = true`, the UACP-Trace collector processor MUST:
1. Strip all attributes matching `llm.input_messages.*` and `llm.output_messages.*`
2. Strip all attributes matching `gen_ai.prompt.*` and `gen_ai.completion.*`
3. Set span status to `UNSET` (not `OK`) to prevent downstream analysis

---

## §5 — Fanout Spans (parallel evaluation)

When multiple model calls are made in parallel for the same user request (e.g., a
multi-perspective eval pipeline), each span SHOULD carry the same `uacp.fanout_id`.

Proposed upstream: `gen_ai.operation.name = "parallel_eval"` — a new value for the
OTel gen_ai operation name enum. File in `open-telemetry/semantic-conventions`.

```
gen_ai.operation.name = "parallel_eval"
uacp.fanout_id = "<shared-uuid-for-this-eval-group>"
```

---

## §6 — OTel Collector Configuration

Implementations SHOULD deploy an OTel Collector with a UACP-Trace processor that:

1. For each span: check `uacp.sensitive`
2. If `true`: apply the redaction filter

Reference processor config (YAML):

```yaml
processors:
  uacp_trace_redact:
    patterns:
      - attribute_pattern: "^llm\\.input_messages\\."
      - attribute_pattern: "^llm\\.output_messages\\."
      - attribute_pattern: "^gen_ai\\.prompt\\."
      - attribute_pattern: "^gen_ai\\.completion\\."
    condition: 'attributes["uacp.sensitive"] == true'
```

---

## §7 — OpenInference Compatibility (informative)

For consumers using Arize Phoenix or other OpenInference-aware platforms, emit the
following optional compatibility attribute:

```
openinference.span.kind = "LLM"  # or RERANKER, GUARDRAIL, EVALUATOR as appropriate
```

This is informational and does not affect UACP-Trace compliance.

---

## §8 — Migration from UACP-Core v1 trace kind

The UACP-Core v1 `trace` kind had the following fields:

| v1 field | UACP-Trace v2 mapping |
|----------|-----------------------|
| `tool` | `gen_ai.system` |
| `command` | `gen_ai.operation.name` |
| `model` | `gen_ai.request.model` |
| `duration_ms` | OTel span duration |
| `tokens_in` | `gen_ai.usage.input_tokens` |
| `tokens_out` | `gen_ai.usage.output_tokens` |
| `privacy_mode` | `uacp.privacy_mode` |
| `session_id` | `uacp.session_id` |

All v1 fields map cleanly to v2. No information is lost in migration.

---

## §9 — Upstream RFC Candidates

The following additions are proposed for upstream OpenTelemetry governance:

1. **`gen_ai.operation.name = "parallel_eval"`** — file in `open-telemetry/semantic-conventions`
   for fanout/multi-perspective evaluation topology.

2. **Per-attribute sensitivity classification** — propose a `gen_ai.attribute.sensitivity`
   metadata standard that enables collector-side attribute stripping without global
   `hide_inputs=True`. This is more surgical than TraceConfig suppression.

---

## Annex A — Change History

| Version | Date       | Summary |
|---------|------------|---------|
| v1      | 2026-05-09 | Initial `trace` kind in UACP-Core (fields: tool, command, model, duration_ms, tokens_in/out, privacy_mode, session_id). |
| v2      | 2026-05-21 | Moved out of UACP-Core into standalone UACP-Trace spec. Rebased on OTel gen_ai profile + `uacp.*` extension layer per ADR 0038 investigation ([#79](https://github.com/hn2/uacp/issues/79)). |
