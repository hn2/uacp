from __future__ import annotations
import re

VALID_KINDS = {'web', 'document', 'vector_store', 'tool_result', 'user_attachment'}
RFC3339_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$')


def _err(path: str, code: str, message: str) -> dict:
    return {'path': path, 'code': code, 'message': message}


def _flattened_text_length(content) -> int:
    if isinstance(content, str):
        return len(content)
    if not isinstance(content, list):
        return 0
    n = 0
    for block in content:
        if isinstance(block, dict) and block.get('type') == 'text':
            t = block.get('text')
            if isinstance(t, str):
                n += len(t)
    return n


def _validate_anchor(anchor, path: str, errors: list[dict], text_len: int) -> None:
    if not isinstance(anchor, dict):
        errors.append(_err(path, 'anchor_invalid', 'anchor must be an object'))
        return
    has_start_end = 'start' in anchor or 'end' in anchor
    has_selector = 'selector' in anchor
    has_page = 'page' in anchor
    branches = sum([has_start_end, has_selector, has_page])
    if branches == 0:
        errors.append(_err(path, 'anchor_no_branch_matched',
                           'anchor must have one of: (start+end), selector, or page'))
        return
    if branches > 1:
        errors.append(_err(path, 'anchor_multiple_branches',
                           'anchor must have exactly one of: (start+end), selector, or page'))
        return

    if has_start_end:
        start = anchor.get('start')
        end = anchor.get('end')
        if not isinstance(start, int) or isinstance(start, bool) or start < 0:
            errors.append(_err(f'{path}.start', 'anchor_start_invalid',
                               'start must be a non-negative integer'))
        if not isinstance(end, int) or isinstance(end, bool) or end < 0:
            errors.append(_err(f'{path}.end', 'anchor_end_invalid',
                               'end must be a non-negative integer'))
        if isinstance(start, int) and isinstance(end, int) and not isinstance(start, bool) and not isinstance(end, bool):
            if end < start:
                errors.append(_err(path, 'anchor_end_before_start',
                                   'anchor.end must be greater than or equal to anchor.start'))
            if text_len > 0 and end > text_len:
                errors.append(_err(path, 'anchor_out_of_range',
                                   f'anchor.end ({end}) is past the end of message text (length {text_len} codepoints)'))
            if text_len > 0 and start > text_len:
                errors.append(_err(path, 'anchor_out_of_range',
                                   f'anchor.start ({start}) is past the end of message text (length {text_len} codepoints)'))
    if has_selector:
        sel = anchor.get('selector')
        if not isinstance(sel, str) or not sel:
            errors.append(_err(f'{path}.selector', 'anchor_selector_invalid',
                               'selector must be a non-empty string'))
    if has_page:
        page = anchor.get('page')
        if not isinstance(page, int) or isinstance(page, bool) or page < 1:
            errors.append(_err(f'{path}.page', 'anchor_page_invalid',
                               'page must be an integer >= 1'))


def validate_citations(doc: dict) -> dict:
    errors: list[dict] = []
    messages = doc.get('messages') or []

    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        citations = m.get('citations')
        if not isinstance(citations, list):
            continue
        text_len = _flattened_text_length(m.get('content'))

        for j, c in enumerate(citations):
            path = f'messages[{i}].citations[{j}]'
            if not isinstance(c, dict):
                errors.append(_err(path, 'citation_invalid', 'citation must be an object'))
                continue

            source = c.get('source') if isinstance(c.get('source'), dict) else None
            has_new_form = 'anchor' in c or (source is not None and 'kind' in source)
            if not has_new_form:
                continue

            if not isinstance(source, dict):
                errors.append(_err(f'{path}.source', 'source_invalid', 'source must be an object'))
                continue
            kind = source.get('kind')
            if kind not in VALID_KINDS:
                errors.append(_err(f'{path}.source.kind', 'source_kind_invalid',
                                   f"source.kind must be one of: {', '.join(sorted(VALID_KINDS))}"))

            retrieved_at = c.get('retrieved_at')
            if kind == 'web' and retrieved_at is None:
                errors.append(_err(f'{path}.retrieved_at', 'web_missing_retrieved_at',
                                   'retrieved_at is required when source.kind is "web"'))
            if retrieved_at is not None:
                if not isinstance(retrieved_at, str) or not RFC3339_RE.match(retrieved_at):
                    errors.append(_err(f'{path}.retrieved_at', 'retrieved_at_invalid',
                                       'retrieved_at must be an RFC 3339 / ISO 8601 datetime string'))

            confidence = c.get('confidence')
            if confidence is not None:
                if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or confidence < 0 or confidence > 1:
                    errors.append(_err(f'{path}.confidence', 'confidence_invalid',
                                       'confidence must be a number between 0 and 1'))

            if 'anchor' not in c:
                errors.append(_err(f'{path}.anchor', 'anchor_missing', 'anchor is required'))
            else:
                _validate_anchor(c['anchor'], f'{path}.anchor', errors, text_len)

    return {'valid': len(errors) == 0, 'errors': errors}
