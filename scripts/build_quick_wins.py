"""Build the Manuva Quick Wins HTML dashboard.

Usage:
    python scripts/build_quick_wins.py [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

# Support running as `python scripts/build_quick_wins.py` (repo root not in path)
# as well as `from scripts.build_quick_wins import main` (repo root is in path).
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.quick_wins.charts import build_bar_dataset, build_gantt_dataset, build_scatter_dataset  # noqa: E402
from scripts.quick_wins.filters import filter_quick_wins  # noqa: E402
from scripts.quick_wins.kpis import compute_kpis  # noqa: E402
from scripts.quick_wins.loaders import (  # noqa: E402
    find_field,
    load_segments,
    parse_arpu_aud,
    parse_mrr_range,
    parse_priority,
)
from scripts.quick_wins.mapping import annotate_tasks  # noqa: E402
from scripts.quick_wins.plan_parser import parse_day_90_review, parse_plan  # noqa: E402
from scripts.quick_wins.style_loader import load_tokens  # noqa: E402
from scripts.quick_wins.integrations import COMPETITOR_MATRIX, INTEGRATIONS  # noqa: E402
from scripts.quick_wins.gaps import FEATURE_GAPS, MANUVA_ADVANTAGES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "docs/research/manuva-gtm/results"
PLAN = ROOT / "docs/marketing/90-day-gtm-plan.md"
TEMPLATE_DIR = ROOT / "scripts/quick_wins/templates"
DEFAULT_OUT = ROOT / "docs/marketing/quick-wins.html"

CHARTER_SLOTS = [
    {"number": 1, "vertical": "Cosmetics", "status": "Open", "contact": "", "note": ""},
    {"number": 2, "vertical": "Cosmetics", "status": "Open", "contact": "", "note": ""},
    {"number": 3, "vertical": "Candle/Soap", "status": "Open", "contact": "", "note": ""},
    {"number": 4, "vertical": "Candle/Soap", "status": "Open", "contact": "", "note": ""},
    {"number": 5, "vertical": "Coffee/Defector", "status": "Open", "contact": "", "note": ""},
]

_ID_NUM = re.compile(r"^(\d+)_")


def _id_num(item_id: str) -> int:
    m = _ID_NUM.match(item_id)
    return int(m.group(1)) if m else 0


def _name_short(name: str) -> str:
    return re.sub(r"\s*[\(\[][^)\]]*[\)\]]\s*$", "", name).strip()


def _mrr_str(value: str | None) -> str:
    r = parse_mrr_range(value)
    if not r:
        return "—"
    lo, hi = r
    fmt = lambda n: f"{n/1000:.1f}k" if n >= 1000 else str(n)
    return f"{fmt(lo)}–{fmt(hi)}"


def _ttv_days(value: str | None) -> int:
    if not value:
        return 30
    m = re.search(r"(\d+)\s*[-–]\s*(\d+)", str(value))
    if m:
        return (int(m.group(1)) + int(m.group(2))) // 2
    m = re.search(r"(\d+)", str(value))
    return int(m.group(1)) if m else 30


def _motion_short(value: str | None) -> str:
    if not value:
        return "—"
    s = str(value)
    if "RECOMMENDED" in s.upper():
        s = re.split(r"(?i)RECOMMENDED[^:]*:\s*", s, maxsplit=1)[-1]
    return s.split(".")[0][:80]


def _where_short(value: str | None) -> list[str]:
    if not value:
        return []
    items = re.split(r"[.;]\s+", str(value))
    return [i.strip() for i in items if i.strip()][:3]


def _build_segment_view(seg: dict, annotated: list[dict], current_week: int) -> dict:
    item_id = seg["item_id"]
    seg_tasks = [t for t in annotated if item_id in t.get("segments_mentioned", [])]
    this_week = [t for t in seg_tasks if t["week"] == current_week]
    this_month = [t for t in seg_tasks if current_week <= t["week"] < current_week + 4]

    if not this_week:
        this_week = [{"week": current_week, "index": 0, "text": "(no plan tasks tagged this week — see Day-90 review for Phase 2 priorities)"}]

    return {
        "id_num": _id_num(item_id),
        "name_short": _name_short(seg.get("name", item_id)),
        "priority": parse_priority(find_field(seg, "priority_ranking")) or 0,
        "arpu": parse_arpu_aud(find_field(seg, "estimated_arpu_aud")) or 0,
        "mrr_str": _mrr_str(find_field(seg, "realistic_12mo_mrr_contribution_aud")),
        "ttv_days": _ttv_days(find_field(seg, "time_to_value_days")),
        "fit": find_field(seg, "manuva_fit_score") or "—",
        "motion_short": _motion_short(find_field(seg, "recommended_foot_in_door_motion")),
        "where_short": _where_short(find_field(seg, "directories_communities")),
        "this_week": this_week,
        "this_month": this_month,
        "source_file": f"docs/research/manuva-gtm/results/{item_id}.json",
    }


def main(out_path: Path = DEFAULT_OUT) -> None:
    segments_all = load_segments(RESULTS)
    quick_wins = filter_quick_wins(segments_all)
    plan_tasks = parse_plan(PLAN)
    annotated = annotate_tasks(plan_tasks)
    day90 = parse_day_90_review(PLAN)
    kpis = compute_kpis(quick_wins)

    weeks = []
    for w in range(1, 13):
        wk_tasks = [t for t in annotated if t["week"] == w]
        phase = wk_tasks[0]["phase"] if wk_tasks else ""
        weeks.append({"week": w, "phase": phase, "tasks": wk_tasks})

    bar = build_bar_dataset(quick_wins)
    scatter = build_scatter_dataset(quick_wins)
    gantt = build_gantt_dataset(annotated)
    segment_views = [_build_segment_view(s, annotated, current_week=1) for s in quick_wins]

    payload = {"bar": bar, "scatter": scatter, "gantt": gantt}

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    tpl = env.get_template("quick-wins.html.j2")
    html = tpl.render(
        generated_at=str(date.today()),
        tokens_css=load_tokens(),
        payload_json=json.dumps(payload, ensure_ascii=False),
        kpis=kpis,
        segments=segment_views,
        weeks=weeks,
        day90=day90,
        charter_slots=CHARTER_SLOTS,
        integrations=INTEGRATIONS,
        competitor_matrix=COMPETITOR_MATRIX,
        feature_gaps=FEATURE_GAPS,
        manuva_advantages=MANUVA_ADVANTAGES,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Wrote {out_path}  ({len(html):,} bytes)")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Build the Manuva Quick Wins HTML dashboard.")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = p.parse_args()
    main(args.out)
