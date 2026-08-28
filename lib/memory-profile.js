const CORE_PROFILE_SCHEMAS = new Set(['user', 'project', 'team'])

function isNamespaced(value) {
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(value)
}

function validateMemoryProfile(body) {
  if (!body.profile_link) return []
  return !CORE_PROFILE_SCHEMAS.has(body.profile_link.schema_id) && !isNamespaced(body.profile_link.schema_id)
    ? ['MEMORY_PROFILE_UNKNOWN_UNNAMESPACED_SCHEMA']
    : []
}

module.exports = { CORE_PROFILE_SCHEMAS, validateMemoryProfile }
