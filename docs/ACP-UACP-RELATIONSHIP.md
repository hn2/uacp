# ACP vs UACP Relationship

## Purpose
This document defines the boundary between ACP and UACP so contributors do not mix concerns across repositories.

## Definitions
- `ACP`: Agent Context Protocol. A broader protocol family focused on runtime agent interoperability, execution surfaces, and integration patterns.
- `UACP`: Unified AI Context Protocol. A data-format specification for representing, validating, exchanging, and replaying AI conversation context.

## Scope Boundary
- ACP owns: runtime protocol behavior, tool/session interoperability, and execution-time integration semantics.
- UACP owns: conversation data model, schemas, canonical examples, validation/conformance vectors, and import/export payload structure.

## Overlap
- Both can reference conversation context, but in different layers:
- ACP may transport or consume conversation data at runtime.
- UACP standardizes the serialized conversation format at rest and in transit.

## Non-Overlap
- UACP does not define ACP runtime RPC semantics.
- ACP does not replace UACP schema/version governance for conversation objects.

## Repository Ownership and Source of Truth
- `hn2/uacp` is the source of truth for UACP specs, schemas, vectors, and conformance docs.
- ACP materials live in ACP-owned repositories and should link to UACP where conversation payload format is required.
- UACP README and docs should avoid ACP runtime design details; ACP docs should avoid redefining UACP schema fields.

## Interop Guidance
- ACP integrations that store/share chat context should emit UACP-compliant conversation objects.
- Migration from legacy or ACP-adjacent conversation formats should include explicit UACP version mapping and validation.
- Any cross-repo change that modifies payload compatibility should be accompanied by:
- a UACP schema/vector update in `hn2/uacp`
- an ACP-side compatibility note referencing that UACP change

## Change Policy
- UACP versioning and schema evolution follow UACP's own semver/deprecation rules.
- ACP protocol evolution must treat UACP payload compatibility as an external dependency with pinned versions.
