import json
import os
import pytest
from uacp.extensions import (
    validate_branching,
    validate_reasoning,
    validate_citations,
    validate_artifacts,
)

EXT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'test-vectors', 'extensions')

MIN = {'uacp': '0.6.0', 'id': 'i', 'tool': 't', 'messages': [{'role': 'user', 'content': 'h'}]}


# ---------------------------------------------------------------------------
# branching
# ---------------------------------------------------------------------------

def test_branching_simple():
    doc = {**MIN, 'messages': [
        {'id': 'm1', 'role': 'user', 'content': 'a'},
        {'id': 'm2', 'role': 'assistant', 'content': 'b'},
        {'id': 'm3', 'role': 'user', 'content': 'a2', 'branch_parent_id': 'm1', 'branch_label': 'edit'},
    ]}
    r = validate_branching(doc)
    assert r['valid'], r['errors']


def test_branching_dangling():
    doc = {**MIN, 'messages': [
        {'id': 'm1', 'role': 'user', 'content': 'a'},
        {'id': 'm2', 'role': 'assistant', 'content': 'b', 'branch_parent_id': 'ghost'},
    ]}
    r = validate_branching(doc)
    assert not r['valid']
    assert any(e['code'] == 'branch_parent_id_dangling' for e in r['errors'])


def test_branching_self_reference():
    doc = {**MIN, 'messages': [
        {'id': 'm1', 'role': 'user', 'content': 'a'},
        {'id': 'm2', 'role': 'assistant', 'content': 'b', 'branch_parent_id': 'm2'},
    ]}
    r = validate_branching(doc)
    assert not r['valid']
    assert any(e['code'] == 'branch_parent_id_self_reference' for e in r['errors'])


def test_branching_cycle():
    doc = {**MIN, 'messages': [
        {'id': 'm1', 'role': 'user', 'content': 'a', 'branch_parent_id': 'm2'},
        {'id': 'm2', 'role': 'assistant', 'content': 'b', 'branch_parent_id': 'm1'},
    ]}
    r = validate_branching(doc)
    assert not r['valid']
    assert any(e['code'] == 'branch_parent_id_cycle' for e in r['errors'])


def test_branching_label_too_long():
    doc = {**MIN, 'messages': [
        {'id': 'm1', 'role': 'user', 'content': 'a'},
        {'id': 'm2', 'role': 'assistant', 'content': 'b', 'branch_label': 'X' * 257},
    ]}
    r = validate_branching(doc)
    assert not r['valid']
    assert any(e['code'] == 'branch_label_too_long' for e in r['errors'])


# ---------------------------------------------------------------------------
# reasoning
# ---------------------------------------------------------------------------

def test_reasoning_valid_thinking():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': [
            {'type': 'thinking', 'text': 'r', 'model_visibility': 'visible', 'tokens': 5},
            {'type': 'text', 'text': 'a'},
        ]},
    ]}
    r = validate_reasoning(doc)
    assert r['valid'], r['errors']


def test_reasoning_redacted():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': [
            {'type': 'thinking', 'text': 'x', 'model_visibility': 'redacted'},
        ]},
    ]}
    r = validate_reasoning(doc)
    assert r['valid'], r['errors']


def test_reasoning_missing_text():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': [{'type': 'thinking', 'model_visibility': 'hidden'}]},
    ]}
    r = validate_reasoning(doc)
    assert not r['valid']
    assert any(e['code'] == 'thinking_missing_text' for e in r['errors'])


def test_reasoning_invalid_visibility():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': [{'type': 'thinking', 'text': 'r', 'model_visibility': 'public'}]},
    ]}
    r = validate_reasoning(doc)
    assert not r['valid']
    assert any(e['code'] == 'model_visibility_invalid' for e in r['errors'])


def test_reasoning_negative_tokens():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': [{'type': 'thinking', 'text': 'r', 'tokens': -1}]},
    ]}
    r = validate_reasoning(doc)
    assert not r['valid']
    assert any(e['code'] == 'tokens_negative' for e in r['errors'])


def test_reasoning_text_too_long():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': [{'type': 'thinking', 'text': 'a' * 1_000_001}]},
    ]}
    r = validate_reasoning(doc)
    assert not r['valid']
    assert any(e['code'] == 'thinking_text_too_long' for e in r['errors'])


# ---------------------------------------------------------------------------
# citations
# ---------------------------------------------------------------------------

def test_citations_web_with_retrieved_at():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'The sky is blue.', 'citations': [{
            'source': {'kind': 'web', 'url': 'https://example.com'},
            'retrieved_at': '2026-05-09T12:00:00Z',
            'anchor': {'start': 0, 'end': 16},
        }]},
    ]}
    r = validate_citations(doc)
    assert r['valid'], r['errors']


def test_citations_document_page():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'See doc.', 'citations': [{
            'source': {'kind': 'document', 'id': 'doc-1'},
            'anchor': {'page': 42},
        }]},
    ]}
    r = validate_citations(doc)
    assert r['valid'], r['errors']


def test_citations_selector():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'See selector.', 'citations': [{
            'source': {'kind': 'tool_result', 'id': 't'},
            'anchor': {'selector': '#main'},
        }]},
    ]}
    r = validate_citations(doc)
    assert r['valid'], r['errors']


def test_citations_web_missing_retrieved_at():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'citations': [{
            'source': {'kind': 'web', 'url': 'https://example.com'},
            'anchor': {'start': 0, 'end': 1},
        }]},
    ]}
    r = validate_citations(doc)
    assert not r['valid']
    assert any(e['code'] == 'web_missing_retrieved_at' for e in r['errors'])


def test_citations_anchor_end_before_start():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'hello', 'citations': [{
            'source': {'kind': 'document', 'id': 'd'},
            'anchor': {'start': 5, 'end': 1},
        }]},
    ]}
    r = validate_citations(doc)
    assert not r['valid']
    assert any(e['code'] == 'anchor_end_before_start' for e in r['errors'])


def test_citations_anchor_no_branch():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'h', 'citations': [{
            'source': {'kind': 'document', 'id': 'd'},
            'anchor': {},
        }]},
    ]}
    r = validate_citations(doc)
    assert not r['valid']
    assert any(e['code'] == 'anchor_no_branch_matched' for e in r['errors'])


def test_citations_retrieved_at_invalid():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'citations': [{
            'source': {'kind': 'web', 'url': 'https://example.com'},
            'retrieved_at': 'yesterday',
            'anchor': {'start': 0, 'end': 1},
        }]},
    ]}
    r = validate_citations(doc)
    assert not r['valid']
    assert any(e['code'] == 'retrieved_at_invalid' for e in r['errors'])


def test_citations_anchor_out_of_range():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'short', 'citations': [{
            'source': {'kind': 'document', 'id': 'd'},
            'anchor': {'start': 100, 'end': 200},
        }]},
    ]}
    r = validate_citations(doc)
    assert not r['valid']
    assert any(e['code'] == 'anchor_out_of_range' for e in r['errors'])


# ---------------------------------------------------------------------------
# artifacts
# ---------------------------------------------------------------------------

def test_artifacts_v1_no_prev():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a1', 'type': 'code', 'title': 't', 'content': 'c',
            'version': 1, 'artifact_lineage_id': 'lin-1',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert r['valid'], r['errors']


def test_artifacts_chain():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a1', 'type': 'code', 'title': 't', 'content': 'v1',
            'version': 1, 'artifact_lineage_id': 'lin-1',
        }]},
        {'role': 'user', 'content': 'edit'},
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a2', 'type': 'code', 'title': 't', 'content': 'v2',
            'version': 2, 'artifact_lineage_id': 'lin-1', 'previous_version_id': 'a1',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert r['valid'], r['errors']


def test_artifacts_v2_missing_prev():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a1', 'type': 'code', 'title': 't', 'content': 'v1',
            'version': 1, 'artifact_lineage_id': 'lin-1',
        }]},
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a2', 'type': 'code', 'title': 't', 'content': 'v2',
            'version': 2, 'artifact_lineage_id': 'lin-1',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert not r['valid']
    assert any(e['code'] == 'previous_version_id_missing' for e in r['errors'])


def test_artifacts_version_zero():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a1', 'type': 'code', 'title': 't', 'content': 'c',
            'version': 0, 'artifact_lineage_id': 'lin-1',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert not r['valid']
    assert any(e['code'] == 'version_invalid' for e in r['errors'])


def test_artifacts_dangling_prev():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a2', 'type': 'code', 'title': 't', 'content': 'v2',
            'version': 2, 'artifact_lineage_id': 'lin-1', 'previous_version_id': 'ghost',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert not r['valid']
    assert any(e['code'] == 'previous_version_id_dangling' for e in r['errors'])


def test_artifacts_lineage_mismatch():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a1', 'type': 'code', 'title': 't', 'content': 'v1',
            'version': 1, 'artifact_lineage_id': 'lin-1',
        }]},
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a2', 'type': 'code', 'title': 't', 'content': 'v2',
            'version': 2, 'artifact_lineage_id': 'lin-OTHER', 'previous_version_id': 'a1',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert not r['valid']
    assert any(e['code'] == 'lineage_id_mismatch' for e in r['errors'])


def test_artifacts_skipped_version():
    doc = {**MIN, 'messages': [
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a1', 'type': 'code', 'title': 't', 'content': 'v1',
            'version': 1, 'artifact_lineage_id': 'lin-1',
        }]},
        {'role': 'assistant', 'content': 'x', 'artifacts': [{
            'id': 'a3', 'type': 'code', 'title': 't', 'content': 'v3',
            'version': 3, 'artifact_lineage_id': 'lin-1', 'previous_version_id': 'a1',
        }]},
    ]}
    r = validate_artifacts(doc)
    assert not r['valid']
    assert any(e['code'] == 'version_not_monotonic' for e in r['errors'])


# ---------------------------------------------------------------------------
# vector files
# ---------------------------------------------------------------------------

def _vectors(subdir: str):
    d = os.path.join(EXT_DIR, subdir)
    if not os.path.isdir(d):
        return []
    return [os.path.join(d, n) for n in sorted(os.listdir(d)) if n.endswith('.json')]


def _run(validator, path):
    with open(path, encoding='utf-8') as f:
        doc = json.load(f)
    expect_invalid = doc.get('metadata', {}).get('uacp.test.expect') == 'invalid'
    r = validator(doc)
    if expect_invalid:
        assert not r['valid'], f'{path}: expected invalid'
    else:
        assert r['valid'], f'{path}: {r["errors"]}'


@pytest.mark.parametrize('path', _vectors('branching'))
def test_branching_vectors(path):
    _run(validate_branching, path)


@pytest.mark.parametrize('path', _vectors('reasoning'))
def test_reasoning_vectors(path):
    _run(validate_reasoning, path)


@pytest.mark.parametrize('path', _vectors('citations'))
def test_citations_vectors(path):
    _run(validate_citations, path)


@pytest.mark.parametrize('path', _vectors('artifacts'))
def test_artifacts_vectors(path):
    _run(validate_artifacts, path)
