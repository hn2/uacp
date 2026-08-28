const CORE_TOPICS = new Set([
  'accessibility', 'career', 'education', 'family', 'finance', 'health',
  'identity', 'location', 'preference', 'project', 'relationship',
])

function isNamespaced(value) {
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(value)
}

function validateMemoryTopics(body) {
  const errors = []
  for (const topic of body.topics || []) {
    if (!CORE_TOPICS.has(topic) && !isNamespaced(topic)) {
      errors.push('MEMORY_TOPIC_UNKNOWN_UNNAMESPACED')
    }
  }
  for (const entry of body.metadata || []) {
    if (!isNamespaced(entry.key) && !['importance', 'locale', 'effective_from'].includes(entry.key)) {
      errors.push('MEMORY_METADATA_UNKNOWN_UNNAMESPACED_KEY')
    }
  }
  return [...new Set(errors)]
}

module.exports = { CORE_TOPICS, validateMemoryTopics }
