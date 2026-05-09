# UACP Python Reference Implementation

Python reference validator for the [Unified AI Context Protocol](https://github.com/hn2/uacp) (UACP).

## Install

```bash
pip install fusionlayer-uacp
```

## Usage

```python
import uacp

# Validate any Python object
result = uacp.validate(doc)
# {"ok": True} or {"ok": False, "errors": ["..."]}

# Parse a JSON string or dict into a typed UACPDocument
doc = uacp.parse('{"uacp": "0.6.0", "id": "...", "tool": "...", "messages": [...]}')

# Serialize a UACPDocument back to a JSON string
json_str = uacp.serialize(doc)
```

## Development

```bash
pip install -e ".[dev]"
pytest tests/ -v
```
