from __future__ import annotations
import json
from .types import UACPDocument
from .validator import validate


def parse(data: str | dict) -> UACPDocument:
    if isinstance(data, str):
        try:
            raw = json.loads(data)
        except json.JSONDecodeError as e:
            raise ValueError(f'UACP parse failed: invalid JSON: {e}') from e
    else:
        raw = data
    result = validate(raw)
    if not result['ok']:
        raise ValueError('UACP parse failed:\n' + '\n'.join(result['errors']))
    return UACPDocument.model_validate(raw)


def serialize(doc: UACPDocument) -> str:
    raw = doc.model_dump(exclude_none=True)
    result = validate(raw)
    if not result['ok']:
        raise ValueError('UACP serialize failed: document is not valid:\n' + '\n'.join(result['errors']))
    return json.dumps(raw)
