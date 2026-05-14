"""
Generate a consolidated markdown report from the deep-research JSON results.

Usage:
    python generate_report.py

Inputs:
    fields.yaml          (field definitions)
    results/*.json       (30 per-item research files)

Output:
    report.md            (consolidated markdown report)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).parent
FIELDS_PATH = ROOT / "fields.yaml"
RESULTS_DIR = ROOT / "results"
OUTPUT_PATH = ROOT / "report.md"


# ─── Category mapping ───────────────────────────────────────────────────────
# JSON key (snake_case) → human-readable section heading
CATEGORY_TITLES: dict[str, str] = {
    "market_sizing": "Market sizing",
    "fit_and_timing": "Fit & roadmap timing",
    "economics": "Economics",
    "where_they_live": "Where they live (acquisition surface)",
    "outreach_fit": "Outreach fit",
    "foot_in_door_fit": "Foot-in-door fit",
    "competitive_context": "Competitive context",
    "partner_channels": "Partner channels",
    "profitability_math": "Profitability math",
}


# Fields used in the TOC line (resolved per item)
TOC_FIELDS = [
    ("tier", "Tier"),
    ("rollout_phase", "Phase"),
    ("priority_ranking", "Priority"),
    ("estimated_arpu_aud", "ARPU"),
    ("recommended_foot_in_door_motion", "Motion"),
    ("realistic_12mo_mrr_contribution_aud", "12mo MRR"),
]

INTERNAL_KEYS = {"_source_file", "uncertain", "item_id", "item_name", "tier"}


# ─── Helpers ────────────────────────────────────────────────────────────────


def slugify(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s


def is_uncertain(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str):
        if not val.strip():
            return True
        if "[uncertain]" in val.lower():
            return True
    return False


def find_field(data: dict, key: str) -> Any:
    """Look up a field by key in either flat or nested JSON structure."""
    if key in data and not isinstance(data[key], dict):
        return data[key]
    # Nested: search known category buckets
    for cat in CATEGORY_TITLES:
        bucket = data.get(cat)
        if isinstance(bucket, dict) and key in bucket:
            return bucket[key]
    # Fallback: walk all nested dicts once
    for v in data.values():
        if isinstance(v, dict) and key in v:
            return v[key]
    return None


def fmt_value(val: Any, depth: int = 0) -> str:
    """Format a field value for markdown. Handles strings, lists, dicts."""
    if isinstance(val, (int, float, bool)):
        return str(val)
    if isinstance(val, str):
        v = val.strip()
        if len(v) > 140 and "\n" not in v:
            # Soft-break long single-line strings to keep table-cells reasonable
            return v
        return v
    if isinstance(val, list):
        if not val:
            return "_(empty)_"
        # List of dicts → one line per dict
        if all(isinstance(x, dict) for x in val):
            lines = []
            for d in val:
                kv = " | ".join(f"**{k}:** {fmt_value(v, depth + 1)}" for k, v in d.items())
                lines.append(f"- {kv}")
            return "\n" + "\n".join(lines)
        # Short flat list → comma-join; long → bullets
        flat = [str(x) for x in val]
        if sum(len(s) for s in flat) < 100:
            return ", ".join(flat)
        return "\n" + "\n".join(f"- {s}" for s in flat)
    if isinstance(val, dict):
        parts = []
        for k, v in val.items():
            parts.append(f"**{k}:** {fmt_value(v, depth + 1)}")
        return "; ".join(parts)
    return str(val)


def short_toc_value(val: Any, max_len: int = 60) -> str:
    """Compress a value for the TOC line."""
    if val is None:
        return "—"
    s = str(val).strip()
    s = s.replace("\n", " ").replace("  ", " ")
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    return s


# ─── Load inputs ────────────────────────────────────────────────────────────


def load_fields() -> dict[str, list[dict]]:
    with FIELDS_PATH.open("r", encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    cats = doc.get("categories") or doc.get("field_categories") or {}
    out: dict[str, list[dict]] = {}
    for cat_key, cat_body in cats.items():
        fields = cat_body.get("fields") if isinstance(cat_body, dict) else []
        out[cat_key] = fields or []
    return out


def load_results() -> list[dict]:
    files = sorted(RESULTS_DIR.glob("*.json"))
    items = []
    for f in files:
        with f.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        data["_source_file"] = f.name
        items.append(data)
    # Sort by leading numeric prefix in filename
    items.sort(key=lambda d: int(re.match(r"(\d+)", d["_source_file"]).group(1)))
    return items


# ─── Report generation ─────────────────────────────────────────────────────


def render_toc(items: list[dict]) -> str:
    lines = ["## Table of contents", ""]
    for idx, data in enumerate(items, 1):
        name = data.get("item_name") or data.get("name") or data["_source_file"]
        anchor = slugify(name)
        bits = []
        for key, label in TOC_FIELDS:
            val = find_field(data, key)
            if val is None or is_uncertain(val):
                continue
            max_len = 32 if key in {"recommended_foot_in_door_motion", "realistic_12mo_mrr_contribution_aud", "estimated_arpu_aud"} else 14
            bits.append(f"{label}: {short_toc_value(val, max_len)}")
        suffix = (" — " + " · ".join(bits)) if bits else ""
        lines.append(f"{idx}. [{name}](#{anchor}){suffix}")
    lines.append("")
    return "\n".join(lines)


def render_item(data: dict, fields_by_cat: dict[str, list[dict]]) -> str:
    name = data.get("item_name") or data.get("name") or data["_source_file"]
    tier = data.get("tier")
    uncertain_set = set(data.get("uncertain") or [])

    out: list[str] = []
    out.append(f"## {name}")
    if tier:
        out.append(f"_Tier {tier} · source: `{data['_source_file']}`_")
    out.append("")

    used_keys: set[str] = set()

    for cat_key, cat_fields in fields_by_cat.items():
        title = CATEGORY_TITLES.get(cat_key, cat_key.replace("_", " ").title())
        bucket = data.get(cat_key)
        rendered_field_lines: list[str] = []

        for fdef in cat_fields:
            fname = fdef.get("name")
            if not fname:
                continue
            used_keys.add(fname)
            if fname in uncertain_set:
                continue
            val = None
            if isinstance(bucket, dict) and fname in bucket:
                val = bucket[fname]
            else:
                val = find_field(data, fname)
            if is_uncertain(val):
                continue
            rendered = fmt_value(val)
            rendered_field_lines.append(f"- **{fname}:** {rendered}")

        if rendered_field_lines:
            out.append(f"### {title}")
            out.extend(rendered_field_lines)
            out.append("")

    # Extra fields (present in JSON but not in fields.yaml) → "Other info"
    extras: list[str] = []
    for k, v in data.items():
        if k in INTERNAL_KEYS:
            continue
        if k in CATEGORY_TITLES:  # nested bucket already rendered
            continue
        if k in used_keys:
            continue
        if is_uncertain(v):
            continue
        extras.append(f"- **{k}:** {fmt_value(v)}")
    if extras:
        out.append("### Other info")
        out.extend(extras)
        out.append("")

    # Uncertain list
    if uncertain_set:
        out.append("### Uncertain fields")
        for u in sorted(uncertain_set):
            out.append(f"- {u}")
        out.append("")

    return "\n".join(out)


def render_report(items: list[dict], fields_by_cat: dict[str, list[dict]]) -> str:
    header = [
        "# Manuva GTM — Deep Research Report",
        "",
        "Consolidated report from 30 deep-research items.",
        "Topic: Manuva GTM — who to target and how to land them profitably.",
        "Solo founder · AU-first · realistic 12-month target AU$3–5K MRR · aspirational AU$1M ARR.",
        "",
        f"**Items:** {len(items)}  ·  **Generated from:** `docs/research/manuva-gtm/results/`",
        "",
        "---",
        "",
    ]
    toc = render_toc(items)
    body_parts = [render_item(d, fields_by_cat) for d in items]
    return "\n".join(header) + toc + "\n---\n\n" + "\n---\n\n".join(body_parts)


def main() -> None:
    fields_by_cat = load_fields()
    items = load_results()
    report = render_report(items, fields_by_cat)
    OUTPUT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} ({len(items)} items, {len(report):,} chars)")


if __name__ == "__main__":
    main()
