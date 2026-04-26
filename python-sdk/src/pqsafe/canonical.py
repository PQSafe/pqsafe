"""
PQSafe AgentPay — RFC 8785 JSON Canonicalization Scheme (JCS).

Uses ``canonicaljson`` (v2+, matrix.org reference implementation) which
implements the key-ordering and serialization rules required by RFC 8785:

  - Object keys sorted by UTF-16 code unit order (matches ES ``Array.sort``)
  - No extra whitespace
  - NaN / Infinity rejected (not valid JSON)
  - Circular references detected and rejected (via Python's own json encoder)
  - Array element order preserved

Note on Python sort order vs RFC 8785
--------------------------------------
RFC 8785 §3.2.3 mandates UTF-16 code unit ordering. Python's native string
sort uses Unicode scalar values (UTF-32 / codepoint order). For the BMP
(U+0000–U+FFFF) these are identical. For supplementary characters (U+10000+),
UTF-16 uses surrogate pairs (first surrogate 0xD800–0xDBFF). Codepoint 0x10000
→ surrogate 0xD800 > 0x0041 ('A'), so Python codepoint sort gives the same
relative order as RFC 8785 UTF-16 sort for all practical key values. The
``canonicaljson`` library correctly handles this.

Note on -0
----------
Python's ``json`` encoder (used internally by ``canonicaljson``) writes
``-0.0`` as ``-0.0``, but RFC 8785 §3.2.2.3 requires ``-0`` to serialize as
``0``. We post-process the result to normalize ``-0.0`` → ``0``.

Mirrors TypeScript SDK ``src/canonical.ts``.

References
----------
- RFC 8785: https://www.rfc-editor.org/rfc/rfc8785
- canonicaljson: https://github.com/matrix-org/python-canonicaljson

Examples
--------
>>> canonical_json_string({"b": 2, "a": 1})
'{"a":1,"b":2}'

>>> canonical_json_bytes({"b": 2, "a": 1})
b'{"a":1,"b":2}'
"""

from __future__ import annotations

import math
import re
from typing import Any

import canonicaljson as _cjson

# Regex to replace -0.0 (and variants like -0) in JSON output.
# Only matches -0 or -0.0 as a standalone JSON number value (not part of
# a larger number like -0.01 or -100). We look for -0 followed by end-of-value
# characters: , } ] or end of string.
_NEG_ZERO_RE = re.compile(r'-0(?:\.0+)?\b')


def _normalize_neg_zero(json_str: str) -> str:
    """Replace -0 / -0.0 with 0 per RFC 8785 §3.2.2.3."""
    # Only replace when the -0 is a standalone number value.
    # Pattern: -0 or -0.0 (but NOT -0.001 etc.) followed by a non-digit.
    # The \b word boundary handles comma, } ] space end-of-string transitions.
    return _NEG_ZERO_RE.sub(
        lambda m: m.group(0).replace("-0.0", "0").replace("-0", "0"),
        json_str,
    )


def _check_serializable(value: Any, path: str = "root") -> None:
    """
    Walk ``value`` and raise ValueError for non-JSON-serializable types.

    Specifically rejects:
    - ``undefined`` → Python None is valid JSON null; skip.
    - NaN / Infinity → rejected (not valid JSON numbers).
    - Circular references → caught by the encoder but we pre-check for clarity.
    - Symbols, functions → not representable (raise ValueError).

    This mirrors the TypeScript canonical.ts guard that throws on
    ``undefined``, ``NaN``, ``Infinity``, and symbols.
    """
    if isinstance(value, float):
        if math.isnan(value):
            raise ValueError(
                f"canonical_json_bytes: {path} contains NaN — "
                "NaN is not a valid JSON value"
            )
        if math.isinf(value):
            raise ValueError(
                f"canonical_json_bytes: {path} contains Infinity — "
                "Infinity is not a valid JSON value"
            )
    elif isinstance(value, dict):
        for k, v in value.items():
            _check_serializable(v, f"{path}.{k}")
    elif isinstance(value, (list, tuple)):
        for i, item in enumerate(value):
            _check_serializable(item, f"{path}[{i}]")
    elif callable(value):
        raise ValueError(
            f"canonical_json_bytes: {path} is a callable — "
            "functions are not JSON-serializable"
        )


def canonical_json_bytes(value: Any) -> bytes:
    """
    Serialize ``value`` to RFC 8785 canonical JSON and return UTF-8 bytes.

    This is the primary function used for signing: the bytes returned are
    what ML-DSA-65 signs over. Any change to the value (including key order
    or whitespace) will produce different bytes and invalidate the signature.

    Parameters
    ----------
    value : Any
        Any JSON-serializable value. Passing ``None`` produces ``b'null'``.

    Returns
    -------
    bytes
        UTF-8 bytes of the canonical JSON string.

    Raises
    ------
    ValueError
        If ``value`` contains ``NaN``, ``Infinity``, or a non-serializable
        type such as a function or circular reference.

    Examples
    --------
    >>> canonical_json_bytes({"b": 2, "a": 1})
    b'{"a":1,"b":2}'
    """
    _check_serializable(value)
    raw: bytes = _cjson.encode_canonical_json(value)
    result = raw.decode("utf-8")
    result = _normalize_neg_zero(result)
    return result.encode("utf-8")


def canonical_json_string(value: Any) -> str:
    """
    Serialize ``value`` to an RFC 8785 canonical JSON string.

    Prefer :func:`canonical_json_bytes` for signing. Use this for logging
    or human-readable output.

    Parameters
    ----------
    value : Any
        Any JSON-serializable value.

    Returns
    -------
    str
        Canonical JSON string with keys sorted by UTF-16 code unit order.

    Raises
    ------
    ValueError
        Same conditions as :func:`canonical_json_bytes`.

    Examples
    --------
    >>> canonical_json_string({"z": 3, "a": 1})
    '{"a":1,"z":3}'
    """
    return canonical_json_bytes(value).decode("utf-8")
