const SENSITIVE_CATEGORIES = new Set(['health', 'financial'])
const ACTIVE_ACTIONS = new Set(['create', 'confirm', 'update', 'supersede', 'rollback'])

function hasReference(references) {
  return Array.isArray(references) && references.length > 0
}

function validateMemoryLifecycle(body, { memoryId } = {}) {
  const errors = []

  if (SENSITIVE_CATEGORIES.has(body.category) && body.consent !== 'explicit') {
    errors.push('MEMORY_LIFECYCLE_SENSITIVE_MEMORY_REQUIRES_EXPLICIT_CONSENT')
  }

  const lifecycle = body.lifecycle
  if (!lifecycle) return errors

  const { action, status, revision, previous_revision: previousRevision } = lifecycle

  if (revision > 1 && !previousRevision) {
    errors.push('MEMORY_LIFECYCLE_PREVIOUS_REVISION_REQUIRED')
  }
  if (revision === 1 && previousRevision) {
    errors.push('MEMORY_LIFECYCLE_INITIAL_REVISION_HAS_PREDECESSOR')
  }
  if (memoryId && previousRevision && previousRevision.memory_id !== memoryId) {
    errors.push('MEMORY_LIFECYCLE_PREVIOUS_REVISION_ID_MISMATCH')
  }
  if (previousRevision && previousRevision.revision !== revision - 1) {
    errors.push('MEMORY_LIFECYCLE_NON_CONTIGUOUS_REVISION')
  }
  if (action === 'create' && revision !== 1) {
    errors.push('MEMORY_LIFECYCLE_CREATE_MUST_START_AT_REVISION_ONE')
  }
  if (action === 'supersede' && !hasReference(body.supersedes)) {
    errors.push('MEMORY_LIFECYCLE_SUPERSEDE_REQUIRES_SUPERSEDES')
  }
  if (action === 'tombstone' && status !== 'tombstoned') {
    errors.push('MEMORY_LIFECYCLE_TOMBSTONE_REQUIRES_TOMBSTONED_STATUS')
  }
  if (status === 'tombstoned' && action !== 'tombstone') {
    errors.push('MEMORY_LIFECYCLE_TOMBSTONED_STATUS_REQUIRES_TOMBSTONE_ACTION')
  }
  if (action === 'expire' && status !== 'expired') {
    errors.push('MEMORY_LIFECYCLE_EXPIRE_REQUIRES_EXPIRED_STATUS')
  }
  if (status === 'expired' && action !== 'expire') {
    errors.push('MEMORY_LIFECYCLE_EXPIRED_STATUS_REQUIRES_EXPIRE_ACTION')
  }
  if (action === 'rollback' && (!previousRevision || !hasReference(body.derived_from))) {
    errors.push('MEMORY_LIFECYCLE_ROLLBACK_REQUIRES_LINEAGE')
  }
  if (ACTIVE_ACTIONS.has(action) && status !== 'active') {
    errors.push('MEMORY_LIFECYCLE_ACTIVE_ACTION_REQUIRES_ACTIVE_STATUS')
  }

  return errors
}

module.exports = { validateMemoryLifecycle }
