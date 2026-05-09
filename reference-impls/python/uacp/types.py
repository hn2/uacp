from __future__ import annotations
from typing import Literal, Union
from pydantic import BaseModel, ConfigDict


class ModelRef(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
    provider: str | None = None
    snapshot_date: str | None = None


class TokenUsage(BaseModel):
    model_config = ConfigDict(extra='forbid')
    input: int | None = None
    output: int | None = None


class ToolCall(BaseModel):
    model_config = ConfigDict(extra='forbid')
    call_id: str
    name: str
    arguments: object = None


class CitationSource(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str
    title: str | None = None
    snippet: str | None = None


class Citation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    span: list[int]
    source: CitationSource


class Artifact(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
    type: Literal['code', 'html', 'svg', 'markdown', 'react', 'text']
    title: str
    content: str
    language: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class Attachment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
    mime_type: str
    filename: str | None = None
    size_bytes: int | None = None
    url: str | None = None
    data: str | None = None
    sha256: str | None = None


class Redactions(BaseModel):
    model_config = ConfigDict(extra='forbid')
    count: int
    placeholder_format: str
    categories: list[str] | None = None


class ContentBlock(BaseModel):
    model_config = ConfigDict(extra='allow')
    type: Literal['text', 'image', 'file', 'code', 'thinking', 'artifact_ref', 'audio', 'video', 'pdf', 'latex']
    text: str | None = None
    code: str | None = None
    url: str | None = None
    data: str | None = None
    id: str | None = None
    language: str | None = None
    filename: str | None = None
    signature: str | None = None
    mime_type: str | None = None
    duration_s: float | None = None
    title: str | None = None
    display: bool | None = None
    size_bytes: int | None = None


class Message(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['user', 'assistant', 'system', 'tool']
    content: Union[str, list[ContentBlock]]
    id: str | None = None
    parent_id: str | None = None
    timestamp: str | None = None
    model: Union[str, ModelRef, None] = None
    tokens: TokenUsage | None = None
    status: Literal['complete', 'in_progress', 'error'] | None = None
    tool_calls: list[ToolCall] | None = None
    call_id: str | None = None
    tool_call_id: str | None = None
    name: str | None = None
    attachments: list[Attachment] | None = None
    citations: list[Citation] | None = None
    artifacts: list[Artifact] | None = None
    redactions: Redactions | None = None
    metadata: dict | None = None
    provenance: Literal['extracted', 'inferred', 'system', 'tool_output'] | None = None
    confidence: float | None = None
    provenance_source: str | None = None


class UACPDocument(BaseModel):
    model_config = ConfigDict(extra='allow')
    uacp: str
    id: str
    tool: Union[str, list[str]]
    tool_chain: list[str] | None = None
    model: Union[str, ModelRef, None] = None
    title: str | None = None
    extensions: list[str] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    tags: list[str] | None = None
    project: str | None = None
    branches: list[str] | None = None
    messages: list[Message]
    metadata: dict | None = None
