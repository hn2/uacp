import { validate } from './validator.js'
import type { UACPDocument } from './types.js'

export const UACP_VERSION = '0.7.0'

export function parse(json: string | object): UACPDocument {
  const doc = typeof json === 'string' ? JSON.parse(json) : json
  const result = validate(doc)
  if (!result.ok) {
    throw new Error(`UACP parse failed:\n${result.errors!.join('\n')}`)
  }
  return doc as UACPDocument
}

export function serialize(doc: UACPDocument): string {
  const result = validate(doc)
  if (!result.ok) {
    throw new Error(`UACP serialize failed: document is not valid:\n${result.errors!.join('\n')}`)
  }
  return JSON.stringify(doc)
}
