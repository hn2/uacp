from __future__ import annotations
import re

SEMVER_RE = re.compile(r'^\d+\.\d+\.\d+$')
ISO8601_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$')
VALID_ROLES = {'user', 'assistant', 'system', 'tool'}
VALID_PRIVACY = {'private', 'personal', 'team', 'public'}
VALID_CONTENT_TYPES = {'text', 'image', 'file', 'code', 'thinking', 'artifact_ref', 'audio', 'video', 'pdf', 'latex'}
VALID_ARTIFACT_TYPES = {'code', 'html', 'svg', 'markdown', 'react', 'text'}
VALID_MSG_STATUS = {'complete', 'in_progress', 'error'}
VALID_PROVENANCE = {'extracted', 'inferred', 'system', 'tool_output'}


def _is_obj(v) -> bool:
    return isinstance(v, dict)


def _validate_content_block(block, prefix: str, errors: list[str]) -> None:
    if not _is_obj(block):
        errors.append(f'{prefix}: must be an object')
        return
    btype = block.get('type')
    if not btype or btype not in VALID_CONTENT_TYPES:
        errors.append(f'{prefix}.type: must be one of {", ".join(sorted(VALID_CONTENT_TYPES))}')
        return
    if btype in ('text', 'thinking', 'latex') and not isinstance(block.get('text'), str):
        errors.append(f'{prefix}: {btype} block requires text (string)')
    if btype == 'code' and not isinstance(block.get('code'), str):
        errors.append(f'{prefix}: code block requires code (string)')
    if btype == 'artifact_ref' and not isinstance(block.get('id'), str):
        errors.append(f'{prefix}: artifact_ref block requires id (string)')
    if btype in ('image', 'file', 'audio', 'video', 'pdf'):
        if not isinstance(block.get('url'), str) and not isinstance(block.get('data'), str):
            errors.append(f'{prefix}: {btype} block requires url or data')


def _validate_citation(c, prefix: str, errors: list[str]) -> None:
    if not _is_obj(c):
        errors.append(f'{prefix}: must be an object')
        return
    span = c.get('span')
    if not isinstance(span, list) or len(span) != 2 or not all(isinstance(v, int) for v in span):
        errors.append(f'{prefix}.span: must be [int, int]')
    source = c.get('source')
    if not _is_obj(source) or not isinstance(source.get('url'), str):
        errors.append(f'{prefix}.source.url: required')
    elif not source['url'].startswith(('http://', 'https://')):
        errors.append(f'{prefix}.source.url: must start with http:// or https://')


def _validate_artifact(a, prefix: str, errors: list[str]) -> None:
    if not _is_obj(a):
        errors.append(f'{prefix}: must be an object')
        return
    if not isinstance(a.get('id'), str) or not a['id']:
        errors.append(f'{prefix}.id: required')
    if a.get('type') not in VALID_ARTIFACT_TYPES:
        errors.append(f'{prefix}.type: must be one of {", ".join(sorted(VALID_ARTIFACT_TYPES))}')
    if not isinstance(a.get('title'), str) or not a['title']:
        errors.append(f'{prefix}.title: required')
    if not isinstance(a.get('content'), str):
        errors.append(f'{prefix}.content: required (string)')


def _validate_message(msg, idx: int, errors: list[str]) -> None:
    p = f'messages[{idx}]'
    if not _is_obj(msg):
        errors.append(f'{p}: must be an object')
        return
    role = msg.get('role')
    if role not in VALID_ROLES:
        errors.append(f'{p}.role: must be one of {", ".join(sorted(VALID_ROLES))}')
    content = msg.get('content')
    if content is None:
        errors.append(f'{p}.content: required')
    elif isinstance(content, list):
        for j, block in enumerate(content):
            _validate_content_block(block, f'{p}.content[{j}]', errors)
    elif not isinstance(content, str):
        errors.append(f'{p}.content: must be a string or array of content blocks')
    status = msg.get('status')
    if status is not None and status not in VALID_MSG_STATUS:
        errors.append(f'{p}.status: must be one of {", ".join(sorted(VALID_MSG_STATUS))}')
    ts = msg.get('timestamp')
    if ts is not None and not ISO8601_RE.match(ts):
        errors.append(f'{p}.timestamp: must be an ISO 8601 datetime string')
    provenance = msg.get('provenance')
    if provenance is not None and provenance not in VALID_PROVENANCE:
        errors.append(f'{p}.provenance: must be one of {", ".join(sorted(VALID_PROVENANCE))}')
    confidence = msg.get('confidence')
    if provenance == 'inferred' and confidence is None:
        errors.append(f'{p}.confidence: required when provenance=inferred')
    if provenance == 'extracted' and confidence is not None:
        errors.append(f'{p}.confidence: must not be present when provenance=extracted')
    citations = msg.get('citations')
    if citations is not None:
        if not isinstance(citations, list):
            errors.append(f'{p}.citations: must be an array')
        else:
            for j, c in enumerate(citations):
                _validate_citation(c, f'{p}.citations[{j}]', errors)
    artifacts = msg.get('artifacts')
    if artifacts is not None:
        if not isinstance(artifacts, list):
            errors.append(f'{p}.artifacts: must be an array')
        else:
            for j, a in enumerate(artifacts):
                _validate_artifact(a, f'{p}.artifacts[{j}]', errors)


def validate(doc: object) -> dict:
    errors: list[str] = []

    if not _is_obj(doc):
        return {'ok': False, 'errors': ['Root must be a JSON object']}

    uacp = doc.get('uacp')
    if not isinstance(uacp, str) or not SEMVER_RE.match(uacp):
        errors.append('uacp: must be a semver string (e.g. "0.6.0")')

    doc_id = doc.get('id')
    if not isinstance(doc_id, str) or not doc_id.strip():
        errors.append('id: required, must be a non-empty string')

    tool = doc.get('tool')
    if tool is None:
        errors.append('tool: required, must be a string or array of strings')
    elif not isinstance(tool, str) and not (isinstance(tool, list) and all(isinstance(t, str) for t in tool)):
        errors.append('tool: must be a string or array of strings')

    messages = doc.get('messages')
    if not isinstance(messages, list):
        errors.append('messages: required, must be an array')
    elif len(messages) == 0:
        errors.append('messages: must contain at least one message')
    else:
        for i, msg in enumerate(messages):
            _validate_message(msg, i, errors)

    privacy = doc.get('privacy')
    if privacy is not None and privacy not in VALID_PRIVACY:
        errors.append(f'privacy: must be one of {", ".join(sorted(VALID_PRIVACY))}')

    created_at = doc.get('created_at')
    if created_at is not None and not ISO8601_RE.match(created_at):
        errors.append('created_at: must be an ISO 8601 datetime string')

    updated_at = doc.get('updated_at')
    if updated_at is not None and not ISO8601_RE.match(updated_at):
        errors.append('updated_at: must be an ISO 8601 datetime string')

    extensions = doc.get('extensions')
    if extensions is not None:
        if not isinstance(extensions, list):
            errors.append('extensions: must be an array')
        elif len(extensions) > 32:
            errors.append('extensions: must not contain more than 32 items')

    branches = doc.get('branches')
    if branches is not None and not isinstance(branches, list):
        errors.append('branches: must be an array of strings')

    if errors:
        return {'ok': False, 'errors': errors}
    return {'ok': True}
