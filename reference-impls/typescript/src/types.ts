export type UACPVersion = string

export type PrivacyMode = 'private' | 'personal' | 'team' | 'public'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type MessageStatus = 'complete' | 'in_progress' | 'error'

export type ContentBlockType =
  | 'text'
  | 'image'
  | 'file'
  | 'code'
  | 'thinking'
  | 'artifact_ref'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'latex'

export interface TextBlock {
  type: 'text'
  text: string
}

export interface CodeBlock {
  type: 'code'
  code: string
  language?: string
}

export interface ThinkingBlock {
  type: 'thinking'
  text: string
  signature?: string
}

export interface ArtifactRefBlock {
  type: 'artifact_ref'
  id: string
}

export interface LatexBlock {
  type: 'latex'
  text: string
}

export interface ImageBlock {
  type: 'image'
  url?: string
  data?: string
  media_type?: string
}

export interface FileBlock {
  type: 'file'
  url?: string
  data?: string
  filename?: string
  media_type?: string
}

export type ContentBlock =
  | TextBlock
  | CodeBlock
  | ThinkingBlock
  | ArtifactRefBlock
  | LatexBlock
  | ImageBlock
  | FileBlock
  | { type: 'audio' | 'video' | 'pdf'; [key: string]: unknown }

export interface TokenUsage {
  input?: number
  output?: number
  total?: number
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface Citation {
  span: [number, number]
  source: {
    url: string
    title?: string
  }
}

export interface Artifact {
  id: string
  type: 'code' | 'html' | 'svg' | 'markdown' | 'react' | 'text'
  title: string
  content: string
  language?: string
}

export interface Message {
  role: MessageRole
  content: string | ContentBlock[]
  id?: string
  parent_id?: string
  timestamp?: string
  model?: string
  tokens?: TokenUsage
  status?: MessageStatus
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
  attachments?: ContentBlock[]
  citations?: Citation[]
  artifacts?: Artifact[]
  metadata?: Record<string, unknown>
}

export interface UACPDocument {
  uacp: UACPVersion
  id: string
  tool: string
  model?: string
  title?: string
  privacy?: PrivacyMode
  created_at?: string
  updated_at?: string
  messages: Message[]
  branches?: string[]
  extensions?: Extension[]
  metadata?: Record<string, unknown>
}

export interface Extension {
  id: string
  version?: string
  [key: string]: unknown
}

export interface ValidationResult {
  ok: boolean
  errors?: string[]
}
