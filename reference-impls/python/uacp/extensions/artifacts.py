from __future__ import annotations


def _err(path: str, code: str, message: str) -> dict:
    return {'path': path, 'code': code, 'message': message}


def validate_artifacts(doc: dict) -> dict:
    errors: list[dict] = []
    messages = doc.get('messages') or []

    by_id: dict[str, dict] = {}
    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        artifacts = m.get('artifacts')
        if not isinstance(artifacts, list):
            continue
        for j, a in enumerate(artifacts):
            if not isinstance(a, dict):
                continue
            aid = a.get('id')
            if isinstance(aid, str) and aid:
                by_id[aid] = {'artifact': a, 'path': f'messages[{i}].artifacts[{j}]'}

    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        artifacts = m.get('artifacts')
        if not isinstance(artifacts, list):
            continue
        for j, a in enumerate(artifacts):
            if not isinstance(a, dict):
                continue
            path = f'messages[{i}].artifacts[{j}]'
            lineage_id = a.get('artifact_lineage_id')
            prev_id = a.get('previous_version_id')
            version = a.get('version')
            immutable = a.get('immutable')

            using_ext = ('artifact_lineage_id' in a) or ('previous_version_id' in a) or ('immutable' in a)
            if not using_ext:
                continue

            if not isinstance(version, int) or isinstance(version, bool) or version < 1:
                errors.append(_err(f'{path}.version', 'version_invalid',
                                   'version must be an integer >= 1'))

            if lineage_id is not None:
                if not isinstance(lineage_id, str) or not lineage_id or len(lineage_id) > 256:
                    errors.append(_err(f'{path}.artifact_lineage_id', 'lineage_id_invalid',
                                       'artifact_lineage_id must be a non-empty string of at most 256 characters'))
            if immutable is not None and not isinstance(immutable, bool):
                errors.append(_err(f'{path}.immutable', 'immutable_invalid', 'immutable must be a boolean'))

            if isinstance(version, int) and not isinstance(version, bool):
                if version == 1:
                    if 'previous_version_id' in a:
                        errors.append(_err(f'{path}.previous_version_id', 'previous_version_id_on_v1',
                                           'previous_version_id must be absent for version 1'))
                elif version > 1:
                    if prev_id is None:
                        errors.append(_err(f'{path}.previous_version_id', 'previous_version_id_missing',
                                           'previous_version_id is required when version > 1'))
                    elif not isinstance(prev_id, str) or not prev_id:
                        errors.append(_err(f'{path}.previous_version_id', 'previous_version_id_invalid',
                                           'previous_version_id must be a non-empty string'))
                    else:
                        prev = by_id.get(prev_id)
                        if not prev:
                            errors.append(_err(f'{path}.previous_version_id', 'previous_version_id_dangling',
                                               f"previous_version_id '{prev_id}' does not match any artifact in the conversation"))
                        else:
                            prev_artifact = prev['artifact']
                            prev_version = prev_artifact.get('version')
                            prev_lineage = prev_artifact.get('artifact_lineage_id')
                            if isinstance(prev_lineage, str) and isinstance(lineage_id, str) and prev_lineage != lineage_id:
                                errors.append(_err(f'{path}.artifact_lineage_id', 'lineage_id_mismatch',
                                                   f"artifact_lineage_id '{lineage_id}' does not match previous version's lineage '{prev_lineage}'"))
                            if isinstance(prev_version, int) and not isinstance(prev_version, bool):
                                expected = prev_version + 1
                                if version != expected:
                                    errors.append(_err(f'{path}.version', 'version_not_monotonic',
                                                       f'version must equal previous version + 1 (expected {expected}, got {version})'))

    return {'valid': len(errors) == 0, 'errors': errors}
