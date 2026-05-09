from __future__ import annotations

MAX_LABEL = 256


def _err(path: str, code: str, message: str) -> dict:
    return {'path': path, 'code': code, 'message': message}


def validate_branching(doc: dict) -> dict:
    errors: list[dict] = []
    messages = doc.get('messages') or []

    id_index: dict[str, int] = {}
    for i, m in enumerate(messages):
        mid = m.get('id') if isinstance(m, dict) else None
        if isinstance(mid, str) and mid:
            id_index[mid] = i

    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        path = f'messages[{i}]'
        label = m.get('branch_label')
        if isinstance(label, str) and len(label) > MAX_LABEL:
            errors.append(_err(f'{path}.branch_label', 'branch_label_too_long',
                               f'branch_label must be at most {MAX_LABEL} characters'))

        parent = m.get('branch_parent_id')
        if parent is None:
            continue

        if not isinstance(parent, str) or not parent:
            errors.append(_err(f'{path}.branch_parent_id', 'branch_parent_id_invalid',
                               'branch_parent_id must be a non-empty string'))
            continue

        mid = m.get('id')
        if isinstance(mid, str) and parent == mid:
            errors.append(_err(f'{path}.branch_parent_id', 'branch_parent_id_self_reference',
                               'branch_parent_id must not equal the message id'))
            continue

        if parent not in id_index:
            errors.append(_err(f'{path}.branch_parent_id', 'branch_parent_id_dangling',
                               f"branch_parent_id '{parent}' does not match any message id in the conversation"))
            continue

    # Cycle detection
    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        parent = m.get('branch_parent_id')
        mid = m.get('id')
        if not parent or not mid:
            continue
        visited: set[str] = set()
        current = parent
        while current:
            if current in visited:
                break
            if current == mid:
                errors.append(_err(f'messages[{i}].branch_parent_id', 'branch_parent_id_cycle',
                                   f"branch_parent_id chain forms a cycle through message '{mid}'"))
                break
            visited.add(current)
            parent_idx = id_index.get(current)
            if parent_idx is None:
                break
            current = messages[parent_idx].get('branch_parent_id') if isinstance(messages[parent_idx], dict) else None

    return {'valid': len(errors) == 0, 'errors': errors}
