# UACP Boundary: Data Primitives vs Orchestration Policy

## UACP Includes
- Conversation/export/envelope data model.
- Message content blocks, roles, provenance, attachments.
- Branch topology representation.
- Schema-level validation constraints.

## UACP Excludes
- Runtime execution strategy (single/debate/council/pipeline selection).
- Vendor/model routing policy.
- Cost optimization policy.
- Product-specific UX behavior and prompting policy.

## Rule
If a rule can be validated from a standalone UACP JSON document, it belongs in UACP.
If a rule depends on runtime execution decisions or product policy, it belongs outside UACP.
