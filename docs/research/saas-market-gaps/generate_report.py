"""Generate report.md from research JSONs.

Reads outline.yaml + fields.yaml + results/*.json and produces a single markdown
report with a TOC + detailed per-item sections grouped by field category.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
OUTLINE = ROOT / "outline.yaml"
FIELDS = ROOT / "fields.yaml"
RESULTS_DIR = ROOT / "results"
REPORT = ROOT / "report.md"

CATEGORY_TITLES = {
    "market_sizing": "Market sizing",
    "pricing_reality": "Pricing reality",
    "competitive_landscape": "Competitive landscape",
    "opportunity_quality": "Opportunity quality",
    "build_difficulty": "Build difficulty",
    "distribution_difficulty": "Distribution difficulty",
    "personal_fit": "Personal fit (Manuva reuse / founder fit)",
    "unit_economics": "Unit economics",
}

# Summary fields shown next to each TOC entry. Order is preserved.
TOC_FIELDS = [
    ("tier", "Tier"),
    ("realistic_arpu_au", "AU ARPU"),
    ("customers_needed_for_target_arr", "→ $1M ARR"),
]

META_KEYS = {"id", "name", "tier", "hypothesis", "uncertain", "_source_file"}


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def load_results() -> list[dict]:
    items = []
    for p in sorted(RESULTS_DIR.glob("*.json")):
        with p.open("r", encoding="utf-8") as fh:
            obj = json.load(fh)
        obj["_source_file"] = p.name
        items.append(obj)
    return items


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s_-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def value_is_uncertain(val) -> bool:
    if val is None:
        return True
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return True
        if "[uncertain]" in s.lower():
            return True
    return False


def lookup_value(data: dict, category_key: str, field_name: str):
    """Find a field value across flat / nested / multi-cased JSON shapes."""
    # 1. Direct top-level
    if field_name in data and not isinstance(data[field_name], dict):
        return data[field_name]
    # 2. Inside expected category key
    if category_key in data and isinstance(data[category_key], dict):
        if field_name in data[category_key]:
            return data[category_key][field_name]
    # 3. Any nested dict
    for v in data.values():
        if isinstance(v, dict) and field_name in v and not isinstance(v[field_name], dict):
            return v[field_name]
    return None


def fmt_value(val) -> str:
    if isinstance(val, list):
        if not val:
            return ""
        if all(isinstance(x, dict) for x in val):
            lines = []
            for d in val:
                parts = [f"**{k}**: {v}" for k, v in d.items()]
                lines.append(" | ".join(parts))
            return "\n".join(f"- {ln}" for ln in lines)
        joined = ", ".join(str(x) for x in val)
        if len(joined) > 120:
            return "\n".join(f"- {x}" for x in val)
        return joined
    if isinstance(val, dict):
        return "; ".join(f"**{k}**: {v}" for k, v in val.items())
    s = str(val)
    return s


def truncate(s: str, max_len: int = 60) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


def collect_other_fields(item: dict, fields_schema: dict) -> dict[str, object]:
    """Fields present in JSON but not declared in fields.yaml (excluding meta + categories)."""
    declared: set[str] = set()
    for cat in fields_schema.get("categories", {}).values():
        for f in cat.get("fields", []):
            declared.add(f["name"])
    other: dict[str, object] = {}
    for key, val in item.items():
        if key in META_KEYS:
            continue
        if key in CATEGORY_TITLES:
            continue  # category bucket, handled separately
        if isinstance(val, dict):
            for sub_k, sub_v in val.items():
                if sub_k not in declared:
                    other[f"{key}.{sub_k}"] = sub_v
        else:
            if key not in declared:
                other[key] = val
    return other


def main() -> None:
    outline = load_yaml(OUTLINE)
    fields_schema = load_yaml(FIELDS)
    results = load_results()

    # Index outline items by id for metadata fallback
    outline_index = {it["id"]: it for it in outline["items"]}

    # Pair each result with its outline metadata (filename id -> outline id)
    enriched: list[dict] = []
    for item in results:
        source_id = item.get("id") or item["_source_file"].replace(".json", "")
        meta = outline_index.get(source_id, {})
        item["_outline_id"] = source_id
        item["_name"] = item.get("name") or meta.get("name", source_id)
        item["_tier"] = item.get("tier") or meta.get("tier", "?")
        item["_hypothesis"] = item.get("hypothesis") or meta.get("hypothesis", "")
        # Order index: strip leading number from id
        m = re.match(r"^(\d+)", source_id)
        item["_order"] = int(m.group(1)) if m else 999
        enriched.append(item)

    enriched.sort(key=lambda x: x["_order"])

    out: list[str] = []
    topic = outline.get("topic", "Research report")
    out.append(f"# {topic}\n")
    out.append(f"> Generated from `{RESULTS_DIR.relative_to(ROOT.parent.parent)}` — {len(enriched)} items.\n")
    if outline.get("description"):
        out.append(f"{outline['description']}\n")

    # ─── Table of contents ───
    out.append("## Contents\n")
    for idx, item in enumerate(enriched, start=1):
        name = item["_name"]
        anchor = slugify(f"{idx} {name}")
        summary_bits = []
        uncertain_set = set(item.get("uncertain", []) or [])
        for field_name, label in TOC_FIELDS:
            if field_name == "tier":
                tier = item["_tier"]
                summary_bits.append(f"**{label}:** {tier}")
                continue
            if field_name in uncertain_set:
                continue
            val = lookup_value(item, "", field_name)
            if value_is_uncertain(val):
                continue
            summary_bits.append(f"**{label}:** {truncate(fmt_value(val), 60)}")
        suffix = " — " + " · ".join(summary_bits) if summary_bits else ""
        out.append(f"{idx}. [{name}](#{anchor}){suffix}")
    out.append("")

    # ─── Per-item detail sections ───
    for idx, item in enumerate(enriched, start=1):
        name = item["_name"]
        anchor = slugify(f"{idx} {name}")
        out.append(f"\n---\n")
        out.append(f"## {idx}. {name}\n")
        out.append(f"<a id=\"{anchor}\"></a>")
        out.append(f"**Tier:** {item['_tier']} · **Source:** `{item['_source_file']}`\n")
        if item["_hypothesis"]:
            out.append(f"> {item['_hypothesis']}\n")

        uncertain_set = set(item.get("uncertain", []) or [])

        for cat_key, cat_def in fields_schema.get("categories", {}).items():
            title = CATEGORY_TITLES.get(cat_key, cat_key.replace("_", " ").title())
            rows: list[tuple[str, str]] = []
            for f in cat_def.get("fields", []):
                fname = f["name"]
                if fname in uncertain_set:
                    continue
                val = lookup_value(item, cat_key, fname)
                if value_is_uncertain(val):
                    continue
                rows.append((fname, fmt_value(val)))
            if not rows:
                continue
            out.append(f"\n### {title}\n")
            for fname, fval in rows:
                pretty_name = fname.replace("_", " ")
                if "\n" in fval or len(fval) > 220:
                    out.append(f"**{pretty_name}**\n")
                    out.append(fval)
                    out.append("")
                else:
                    out.append(f"- **{pretty_name}** — {fval}")

        # Other fields not declared in schema
        other = collect_other_fields(item, fields_schema)
        if other:
            out.append("\n### Other info\n")
            for k, v in other.items():
                if value_is_uncertain(v):
                    continue
                pretty_name = k.replace("_", " ")
                out.append(f"- **{pretty_name}** — {fmt_value(v)}")

        # Uncertain list at end
        if uncertain_set:
            out.append("\n### Flagged uncertain\n")
            for u in sorted(uncertain_set):
                out.append(f"- {u}")

    REPORT.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {REPORT} ({len(out)} lines, {len(enriched)} items)")


if __name__ == "__main__":
    main()
