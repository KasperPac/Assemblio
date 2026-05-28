"""Load research JSONs and parse messy string-valued fields."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# Category buckets used by generate_report.py — fields may be nested here.
CATEGORY_BUCKETS = [
    "market_sizing",
    "fit_and_timing",
    "economics",
    "where_they_live",
    "outreach_fit",
    "foot_in_door_fit",
    "competitive_context",
    "partner_channels",
    "profitability_math",
]


def load_segments(results_dir: Path) -> dict[str, dict]:
    """Read every results/*.json into a dict keyed by item_id."""
    segments: dict[str, dict] = {}
    for path in sorted(results_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        item_id = data.get("item_id") or path.stem
        segments[item_id] = data
    return segments


def find_field(segment: dict, key: str) -> Any:
    """Look up a field anywhere in flat or nested structure."""
    if key in segment and not isinstance(segment[key], dict):
        return segment[key]
    for cat in CATEGORY_BUCKETS:
        bucket = segment.get(cat)
        if isinstance(bucket, dict) and key in bucket:
            return bucket[key]
    for v in segment.values():
        if isinstance(v, dict) and key in v:
            return v[key]
    return None


_NUM_RANGE = re.compile(r"(?:AU?)?\$\s*([\d,]+)\s*[-–]\s*([\d,]+)", re.IGNORECASE)
_NUM_SINGLE = re.compile(r"(?:AU?)?\$\s*([\d,]+)")
_PRIORITY_LEAD = re.compile(r"^\s*(\d+)")
_PHASE_NUM = re.compile(r"phase\s*(\d+)", re.IGNORECASE)


def _to_int(s: str) -> int:
    return int(s.replace(",", ""))


def parse_arpu_aud(value: str | int | None) -> int | None:
    """Parse '$245' or '$280-330' from a free-text ARPU string. Returns midpoint of a range."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value)
    m = _NUM_RANGE.search(s)
    if m:
        return (_to_int(m.group(1)) + _to_int(m.group(2))) // 2
    m = _NUM_SINGLE.search(s)
    return _to_int(m.group(1)) if m else None


def parse_mrr_range(value: str | None) -> tuple[int, int] | None:
    """Parse 'AU$2,900-6,100/mo ...' -> (2900, 6100). Returns (n, n) if single number."""
    if value is None:
        return None
    s = str(value)
    m = _NUM_RANGE.search(s)
    if m:
        return _to_int(m.group(1)), _to_int(m.group(2))
    m = _NUM_SINGLE.search(s)
    if m:
        n = _to_int(m.group(1))
        return n, n
    return None


def parse_priority(value: str | int | None) -> int | None:
    """Parse '1 — Highest-priority...' -> 1."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    m = _PRIORITY_LEAD.match(str(value))
    return int(m.group(1)) if m else None


def parse_phase(value: str | None) -> int | None:
    """Parse 'Phase 1 (months 0-3)' -> 1."""
    if value is None:
        return None
    m = _PHASE_NUM.search(str(value))
    return int(m.group(1)) if m else None
