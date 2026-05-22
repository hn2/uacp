# Withdraw Event v1

A withdraw event stops relay of an artifact from a scope.

## §1 — Payload

```json
{
  "event_type": "withdraw",
  "artifact_id": "uuid",
  "from_scope_id": "uuid"
}
```

## §2 — Semantics

1. Withdrawal stops forwarding/replication from `from_scope_id`.
2. The artifact MUST NOT be deleted from the source scope as a result of withdrawal.
3. Implementations SHOULD rotate the scope key for remaining members when withdrawal indicates a membership change or compromise.

