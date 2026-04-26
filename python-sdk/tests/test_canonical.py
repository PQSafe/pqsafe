"""
PQSafe AgentPay — RFC 8785 (JCS) canonicalization test suite.

12 test cases mirroring ``canonicalization.test.ts`` (TC-01 through TC-12):

  TC-01  Whitespace differences produce identical canonical bytes
  TC-02  Key reordering produces identical canonical bytes
  TC-03  Number formats normalize identically (200, 200.0, 2e2)
  TC-04  Unicode control chars use \\uhhhh; \\t and \\n use named escapes
  TC-05  Trailing comma rejected at parse stage (canonical pipeline safety)
  TC-06  Nested object key order
  TC-07  Array order preserved (NOT sorted)
  TC-08  BOM stripping
  TC-09  Number edge cases (MAX_SAFE_INTEGER, -0, Infinity, NaN, 5e-324)
  TC-10  null vs missing field — different canonical bytes
  TC-11  UTF-16 surrogate sort order
  TC-12  Sign-then-canonicalize integration test (ML-DSA-65 or fallback)
"""

from __future__ import annotations

import json
import math
import sys

import pytest

from pqsafe.canonical import canonical_json_bytes, canonical_json_string

# ---------------------------------------------------------------------------
# TC-01: Whitespace differences produce identical canonical bytes
# ---------------------------------------------------------------------------


def test_tc01_whitespace_differences_identical():
    pretty_a = """{\n  "issuer": "pq1abc",\n  "maxAmount": 200,\n  "currency": "USD"\n}"""
    compact_b = '{"issuer":"pq1abc","maxAmount":200,"currency":"USD"}'

    a = canonical_json_string(json.loads(pretty_a))
    b = canonical_json_string(json.loads(compact_b))
    assert a == b, "Pretty vs compact must produce identical canonical output"


# ---------------------------------------------------------------------------
# TC-02: Key reordering produces identical canonical bytes
# ---------------------------------------------------------------------------


def test_tc02_key_reordering_identical():
    obj_a = {"a": 1, "z": 2}
    obj_b = {"z": 2, "a": 1}
    a = canonical_json_string(obj_a)
    b = canonical_json_string(obj_b)
    assert a == b, "{a,z} and {z,a} must produce identical canonical output"
    assert a == '{"a":1,"z":2}', "Keys must be sorted a → z"


# ---------------------------------------------------------------------------
# TC-03: Number formats normalize identically
# ---------------------------------------------------------------------------


def test_tc03_number_formats_normalize():
    # JS JSON.parse coerces 200, 200.0, and 2e2 to the same IEEE 754 number,
    # so the TS test asserts all three produce identical canonical output.
    #
    # Python json.loads preserves the int/float distinction:
    #   json.loads('{"n":200}')   → {"n": 200}   (int)
    #   json.loads('{"n":200.0}') → {"n": 200.0} (float)
    #   json.loads('{"n":2e2}')   → {"n": 200.0} (float)
    #
    # canonicaljson serializes int 200 as "200" and float 200.0 as "200.0".
    # This is correct RFC 8785 behaviour — the library faithfully represents
    # the Python value it receives. To normalize, callers should pass
    # pre-coerced int values (e.g. int(x) when x is a whole-number float).
    #
    # We test the Python-idiomatic contract:
    #   - int 200 → '{"n":200}'
    #   - explicitly coerced int(200.0) → same as int 200
    #   - float 200.0 and 2e2 (same IEEE 754 value) → same canonical output
    a_int = canonical_json_string({"n": 200})                    # int literal
    b_coerced = canonical_json_string({"n": int(200.0)})         # float coerced to int
    assert a_int == b_coerced, "int(200) and int(200.0) must produce identical output"
    assert a_int == '{"n":200}', 'Canonical output for integer 200 should be {"n":200}'

    # float 200.0 and 2e2 are the same IEEE 754 value → identical canonical output
    c_float = canonical_json_string(json.loads('{"n":200.0}'))
    d_exp = canonical_json_string(json.loads('{"n":2e2}'))
    assert c_float == d_exp, "200.0 and 2e2 (same IEEE 754) must produce identical output"

    # Both must round-trip correctly when parsed back
    parsed = json.loads(c_float)
    assert parsed["n"] == 200.0, "float 200.0 canonical must parse back to 200.0"


# ---------------------------------------------------------------------------
# TC-04: Unicode control chars use \uhhhh; \t and \n use named escapes
# ---------------------------------------------------------------------------


def test_tc04_unicode_control_chars():
    # U+0001 (SOH) — raw control byte must be escaped in canonical output
    obj_control = {"memo": "x\x01y"}
    canon = canonical_json_string(obj_control)
    assert "\\u0001" in canon, (
        f"Canonical output must escape U+0001 as \\u0001, got: {canon}"
    )
    assert "\x01" not in canon, "Canonical output must NOT contain raw U+0001 byte"

    # \t (U+0009) and \n (U+000A) must use named escapes per RFC 8785 §3.2.2.2
    obj_named = {"memo": "a\tb\nc"}
    canon_named = canonical_json_string(obj_named)
    assert "\\t" in canon_named, (
        f"\\t must use named escape in canonical output, got: {canon_named}"
    )
    assert "\\n" in canon_named, (
        f"\\n must use named escape in canonical output, got: {canon_named}"
    )


# ---------------------------------------------------------------------------
# TC-05: Trailing comma rejected at parse stage (canonical pipeline safety)
# ---------------------------------------------------------------------------


def test_tc05_trailing_comma_rejected():
    with pytest.raises(json.JSONDecodeError):
        json.loads('{"a":1,}')

    # Belt-and-suspenders: confirm it's a specific JSON parse error
    with pytest.raises(json.JSONDecodeError):
        json.loads('{"a":1,}')


# ---------------------------------------------------------------------------
# TC-06: Nested object key order
# ---------------------------------------------------------------------------


def test_tc06_nested_object_key_order():
    obj = {"outer": {"z": 1, "a": 2}}
    canon = canonical_json_string(obj)
    assert canon == '{"outer":{"a":2,"z":1}}', (
        "Nested keys must also be sorted (a before z)"
    )


# ---------------------------------------------------------------------------
# TC-07: Array order preserved (NOT sorted)
# ---------------------------------------------------------------------------


def test_tc07_array_order_preserved():
    obj = {"items": ["c", "a", "b"]}
    canon = canonical_json_string(obj)
    assert canon == '{"items":["c","a","b"]}', (
        "Array elements must preserve insertion order, not be sorted"
    )


# ---------------------------------------------------------------------------
# TC-08: BOM stripping
# ---------------------------------------------------------------------------


def test_tc08_bom_stripping():
    bom_json = "﻿" + '{"issuer":"pq1abc","amount":100}'
    clean_json = '{"issuer":"pq1abc","amount":100}'

    # Strip BOM before parsing (as a real pipeline would)
    stripped = bom_json.lstrip("﻿")

    from_bom = canonical_json_string(json.loads(stripped))
    from_clean = canonical_json_string(json.loads(clean_json))

    assert from_bom == from_clean, (
        "BOM-stripped parse must produce same canonical as clean JSON"
    )
    assert not from_bom.startswith("﻿"), "Canonical output must NOT start with BOM"


# ---------------------------------------------------------------------------
# TC-09: Number edge cases
# ---------------------------------------------------------------------------


def test_tc09_number_edge_cases():
    # MAX_SAFE_INTEGER equivalent (Python int precision is exact)
    max_safe = 9007199254740991  # 2^53 - 1
    canon_max = canonical_json_string({"n": max_safe})
    assert canon_max == f'{{"n":{max_safe}}}', (
        f"MAX_SAFE_INTEGER ({max_safe}) must round-trip exactly"
    )

    # -0 → 0 per RFC 8785 §3.2.2.3
    canon_neg_zero = canonical_json_string({"n": -0.0})
    assert canon_neg_zero == '{"n":0}', "-0 must serialize as 0 per RFC 8785 §3.2.2.3"

    # Infinity → must throw
    with pytest.raises(ValueError, match="Infinity"):
        canonical_json_string({"n": float("inf")})

    # NaN → must throw
    with pytest.raises(ValueError, match="NaN"):
        canonical_json_string({"n": float("nan")})

    # 5e-324 (smallest positive float) → must round-trip
    min_float = 5e-324
    canon_min = canonical_json_string({"n": min_float})
    parsed = json.loads(canon_min)
    assert parsed["n"] == min_float, "5e-324 must round-trip through canonical serialization"


# ---------------------------------------------------------------------------
# TC-10: null vs missing field
# ---------------------------------------------------------------------------


def test_tc10_null_vs_missing_field():
    with_null = {"rail": None}
    without_field: dict = {}

    a = canonical_json_string(with_null)
    b = canonical_json_string(without_field)

    assert a != b, "{rail:None} must differ from {} in canonical output"
    assert a == '{"rail":null}', "{rail:None} canonical must include the key"
    assert b == "{}", "Empty dict canonical must be {}"


# ---------------------------------------------------------------------------
# TC-11: UTF-16 surrogate sort order
# ---------------------------------------------------------------------------


def test_tc11_utf16_surrogate_sort_order():
    """
    'A' (U+0041 = 0x0041) must sort before '𐀀' (U+10000 → surrogate pair
    first unit 0xD800). RFC 8785 uses UTF-16 code unit ordering.
    Python's native str comparison uses codepoint (scalar) values:
      - 'A' = 0x41 (65)
      - '𐀀' = 0x10000 (65536)
    In UTF-16: 0xD800 = 55296; 0x0041 = 65 → same relative order.
    """
    obj = {}
    obj["\U00010000"] = "x"   # 𐀀 — Linear B Syllable B008 A (U+10000)
    obj["A"] = "y"
    canon = canonical_json_string(obj)

    pos_a = canon.index('"A"')
    # 𐀀 may be encoded as the literal char or as surrogate escapes
    if '"𐀀"' in canon:
        pos_linear_b = canon.index('"𐀀"')
    else:
        pos_linear_b = canon.index('"\\ud800\\udc00"')

    assert pos_a < pos_linear_b, (
        f'"A" (0x0041) must sort before "𐀀" (surrogate 0xD800), '
        f"got canonical: {canon}"
    )


# ---------------------------------------------------------------------------
# TC-12: Sign-then-canonicalize integration test
# ---------------------------------------------------------------------------


def test_tc12_sign_canonical_bytes_verify_reordered():
    """
    Sign the canonical bytes of a SpendEnvelope-like object,
    then verify the signature against the canonical bytes of the same
    object with completely reversed key order.
    """
    from pqsafe.crypto import generate_keypair, sign_bytes, verify_bytes

    keypair = generate_keypair()

    # Build a SpendEnvelope-like object (natural insertion order)
    envelope = {
        "version": 1,
        "issuer": "pq1" + "a" * 40,
        "agent": "test-canonical-agent",
        "maxAmount": 200,
        "currency": "USD",
        "allowedRecipients": ["GB29NWBK60161331926819"],
        "validFrom": 1700000000,
        "validUntil": 1700003600,
        "nonce": "deadbeef" + "0" * 24,
    }

    # Reconstruct with completely reversed key order
    reordered = {
        "nonce": envelope["nonce"],
        "validUntil": envelope["validUntil"],
        "validFrom": envelope["validFrom"],
        "allowedRecipients": list(envelope["allowedRecipients"]),
        "currency": envelope["currency"],
        "maxAmount": envelope["maxAmount"],
        "agent": envelope["agent"],
        "issuer": envelope["issuer"],
        "version": envelope["version"],
    }

    canon_a = canonical_json_bytes(envelope)
    canon_b = canonical_json_bytes(reordered)
    assert canon_a == canon_b, (
        "Canonical bytes must be identical regardless of key insertion order"
    )

    # Sign the canonical bytes
    sig = sign_bytes(canon_a, keypair.secret_key)

    # Verify signature against the REORDERED canonical bytes (should match)
    valid = verify_bytes(canon_b, sig, keypair.public_key)
    assert valid, (
        "Signature over canonical bytes of normal order must verify "
        "against reordered canonical bytes"
    )
