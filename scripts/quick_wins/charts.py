"""Build chart datasets from quick-win segments and annotated plan tasks."""
from __future__ import annotations

import re

from .loaders import find_field, parse_arpu_aud, parse_mrr_range, parse_priority

PRIORITY_COLORS = {
    1: "#0E5BFF",
    2: "#5B8DEF",
    3: "#9CB5F2",
}
DEFAULT_COLOR = "#A0A6B3"

_NAME_SUFFIX = re.compile(r"\s*[\(\[][^)\]]*[\)\]]\s*$")
_TTV_RANGE = re.compile(r"(\d+)\s*[-–]\s*(\d+)")
_TTV_SINGLE = re.compile(r"(\d+)")
_FIT_LEADING = re.compile(r"(\d+(?:\.\d+)?)")


def _short_name(name: str) -> str:
    return _NAME_SUFFIX.sub("", name).strip()


def _parse_ttv(value: str | None) -> int:
    if not value:
        return 30
    s = str(value)
    m = _TTV_RANGE.search(s)
    if m:
        return (int(m.group(1)) + int(m.group(2))) // 2
    m = _TTV_SINGLE.search(s)
    return int(m.group(1)) if m else 30


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def _parse_fit(value) -> int:
    """Parse manuva_fit_score which may be '5 — strong fit...' or just 5."""
    if value is None:
        return 3
    if isinstance(value, (int, float)):
        return int(value)
    m = _FIT_LEADING.search(str(value))
    return int(float(m.group(1))) if m else 3


def build_bar_dataset(quick_wins: list[dict]) -> dict:
    labels: list[str] = []
    data: list[int] = []
    colors: list[str] = []
    for seg in quick_wins:
        mrr = parse_mrr_range(find_field(seg, "realistic_12mo_mrr_contribution_aud"))
        if not mrr:
            continue
        labels.append(_short_name(seg.get("name", seg.get("item_id", ""))))
        data.append(mrr[1])
        p = parse_priority(find_field(seg, "priority_ranking"))
        colors.append(PRIORITY_COLORS.get(p, DEFAULT_COLOR))
    return {"labels": labels, "data": data, "colors": colors}


def build_scatter_dataset(quick_wins: list[dict]) -> list[dict]:
    points = []
    for seg in quick_wins:
        arpu = parse_arpu_aud(find_field(seg, "estimated_arpu_aud"))
        ttv = _parse_ttv(find_field(seg, "time_to_value_days"))
        fit = _parse_fit(find_field(seg, "manuva_fit_score"))
        if arpu is None:
            continue
        points.append({
            "x": ttv,
            "y": arpu,
            "r": _clamp(fit * 4, 4, 24),
            "label": _short_name(seg.get("name", "")),
            "motion": find_field(seg, "recommended_foot_in_door_motion") or "",
        })
    return points


def build_gantt_dataset(annotated_tasks: list[dict]) -> dict[str, list[dict]]:
    lanes: dict[str, list[dict]] = {"Build": [], "Sell": [], "Support": [], "Content": []}
    for t in annotated_tasks:
        ws = t.get("workstream", "Build")
        if ws not in lanes:
            continue
        lanes[ws].append({
            "week": t["week"],
            "text": t["text"],
            "deliverable": t.get("deliverable", ""),
        })
    return lanes
