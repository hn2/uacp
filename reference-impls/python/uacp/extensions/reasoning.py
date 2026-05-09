from __future__ import annotations

VALID_VISIBILITY = {'visible', 'hidden', 'redacted'}
MAX_THINKING_TEXT = 1_000_000


def _err(path: str, code: str, message: str) -> dict:
    return {'path': path, 'code': code, 'message': message}


def validate_reasoning(doc: dict) -> dict:
    errors: list[dict] = []
    messages = doc.get('messages') or []

    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        content = m.get('content')
        if not isinstance(content, list):
            continue
        for j, block in enumerate(content):
            if not isinstance(block, dict) or block.get('type') != 'thinking':
                continue
            path = f'messages[{i}].content[{j}]'

            text = block.get('text')
            if not isinstance(text, str):
                errors.append(_err(f'{path}.text', 'thinking_missing_text',
                                   'thinking block must have a text field of type string'))
            elif len(text) > MAX_THINKING_TEXT:
                errors.append(_err(f'{path}.text', 'thinking_text_too_long',
                                   f'thinking text must be at most {MAX_THINKING_TEXT} Unicode codepoints'))

            vis = block.get('model_visibility')
            if vis is not None and vis not in VALID_VISIBILITY:
                errors.append(_err(f'{path}.model_visibility', 'model_visibility_invalid',
                                   'model_visibility must be one of: visible, hidden, redacted'))

            tokens = block.get('tokens')
            if tokens is not None:
                if not isinstance(tokens, int) or isinstance(tokens, bool) or tokens < 0:
                    errors.append(_err(f'{path}.tokens', 'tokens_negative',
                                       'tokens must be a non-negative integer'))

    return {'valid': len(errors) == 0, 'errors': errors}
