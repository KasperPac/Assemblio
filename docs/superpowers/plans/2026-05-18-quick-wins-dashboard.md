# Quick Wins Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained `docs/marketing/quick-wins.html` that surfaces the 9 Phase-1 priority segments from the GTM research, the full 12-week plan, and Charter Partner pipeline, all driven by `scripts/build_quick_wins.py` reading the research JSON + plan markdown.

**Architecture:** A Python build script reads `docs/research/manuva-gtm/results/*.json`, `outline.yaml`, the 90-day plan markdown, and the Charter program markdown. It filters segments to the 9 quick wins (Phase 1, priority ≤ 2, addressable now), maps plan tasks onto segments via keyword tables, computes KPI/chart datasets, and renders a Jinja2 template to one HTML file. The HTML uses Chart.js (CDN) for two charts, a hand-rolled SVG Gantt, and inline JS for `localStorage` persistence + filter strip.

**Tech Stack:** Python 3.13 · `pyyaml` 6.0 · `jinja2` 3.1 · `pytest` (tests) · Chart.js 4.x via CDN · vanilla HTML/CSS/JS. All Python deps verified installed.

**Spec:** [`docs/superpowers/specs/2026-05-18-quick-wins-dashboard-design.md`](../specs/2026-05-18-quick-wins-dashboard-design.md)

---

## Prerequisite — branch setup

This plan should land on a fresh branch off `origin/main` (the research files only exist on main; the current `feat/beta-application-gate` branch is unrelated work). Before Task 1:

```bash
git fetch origin
git checkout origin/main -b feat/quick-wins-dashboard
```

If you prefer to land it on a different branch, ensure `docs/research/manuva-gtm/` files are present on disk before starting Task 1.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/build_quick_wins.py` | CLI entry point — orchestrates load, filter, compute, render |
| `scripts/quick_wins/__init__.py` | Empty — marks package |
| `scripts/quick_wins/loaders.py` | Load JSON results + parse outline.yaml + extract field values |
| `scripts/quick_wins/filters.py` | Apply the 9-segment filter |
| `scripts/quick_wins/plan_parser.py` | Parse 90-day-gtm-plan.md into structured tasks |
| `scripts/quick_wins/mapping.py` | Workstream classifier + segment-keyword tables |
| `scripts/quick_wins/kpis.py` | Compute the 4 KPI values |
| `scripts/quick_wins/charts.py` | Build chart datasets (bar, scatter, gantt) |
| `scripts/quick_wins/templates/quick-wins.html.j2` | Jinja2 template |
| `scripts/quick_wins/style_loader.py` | Load + inline `colors_and_type.css` with fallback |
| `tests/scripts/quick_wins/test_loaders.py` | Tests for JSON loading + field extraction |
| `tests/scripts/quick_wins/test_filters.py` | Tests for the 9-segment filter |
| `tests/scripts/quick_wins/test_plan_parser.py` | Tests for plan markdown parsing |
| `tests/scripts/quick_wins/test_mapping.py` | Tests for workstream + segment mapping |
| `tests/scripts/quick_wins/test_kpis.py` | Tests for KPI math |
| `tests/scripts/quick_wins/test_charts.py` | Tests for chart datasets |
| `tests/scripts/quick_wins/test_build.py` | Integration test — full render produces valid HTML |
| `docs/marketing/quick-wins.html` | The output (generated, committed) |

Tests live under `tests/scripts/quick_wins/` mirroring the source layout. The package layout under `scripts/quick_wins/` lets us test each unit in isolation without importing the CLI script.

---

## Task 1: Project scaffolding + first failing test

**Goal:** Create the package directory structure and pytest configuration. Write the first test that fails because the loader module doesn't exist yet.

**Files:**
- Create: `scripts/quick_wins/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/scripts/__init__.py`
- Create: `tests/scripts/quick_wins/__init__.py`
- Create: `tests/scripts/quick_wins/test_loaders.py`
- Modify: `pytest.ini` or `pyproject.toml` (add `tests/scripts` to test paths) — only if not already configured

**Acceptance Criteria:**
- [ ] `python -m pytest tests/scripts/quick_wins/test_loaders.py -v` runs and fails with `ModuleNotFoundError`
- [ ] Package directories exist and are importable
- [ ] No code in `scripts/quick_wins/loaders.py` yet

**Verify:** `python -m pytest tests/scripts/quick_wins/ -v` → 1 failed (import error)

**Steps:**

- [ ] **Step 1: Check if pytest config exists**

```bash
ls pytest.ini pyproject.toml setup.cfg 2>&1 | head
```

If a config file with `[tool.pytest.ini_options]` or `[pytest]` exists, ensure `tests/` is in `testpaths`. If none exists, create `pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
```

- [ ] **Step 2: Create empty package files**

```bash
mkdir -p scripts/quick_wins
mkdir -p tests/scripts/quick_wins
touch scripts/quick_wins/__init__.py
touch tests/__init__.py
touch tests/scripts/__init__.py
touch tests/scripts/quick_wins/__init__.py
```

- [ ] **Step 3: Write the failing test**

Create `tests/scripts/quick_wins/test_loaders.py`:

```python
"""Tests for scripts.quick_wins.loaders."""
from pathlib import Path

import pytest


def test_load_segments_returns_dict_keyed_by_item_id():
    """load_segments() reads results/*.json and returns a dict keyed by item_id."""
    from scripts.quick_wins.loaders import load_segments

    results_dir = Path("docs/research/manuva-gtm/results")
    segments = load_segments(results_dir)

    assert isinstance(segments, dict)
    assert "16_katana_defectors" in segments
    assert segments["16_katana_defectors"]["name"] == "Katana defectors (cross-vertical)"
    assert len(segments) == 30  # all 30 items present
```

- [ ] **Step 4: Run test to verify it fails**

```bash
python -m pytest tests/scripts/quick_wins/test_loaders.py -v
```

Expected: `ModuleNotFoundError: No module named 'scripts.quick_wins.loaders'`

- [ ] **Step 5: Commit**

```bash
git add scripts/quick_wins/__init__.py tests/ pytest.ini
git commit -m "test(quick-wins): scaffold package + failing loader test"
```

---

## Task 2: Implement loaders — JSON + outline.yaml + field extraction

**Goal:** Implement `load_segments()` and a helper `find_field()` that walks nested JSON to locate a field anywhere in the structure. Add tests for the value-parsing helpers (extracting numbers from strings like "AU$245/mo blended").

**Files:**
- Create: `scripts/quick_wins/loaders.py`
- Modify: `tests/scripts/quick_wins/test_loaders.py` — add tests for `find_field`, `parse_arpu_aud`, `parse_priority`, `parse_mrr_range`

**Acceptance Criteria:**
- [ ] `load_segments(Path(...))` returns a dict with all 30 segments keyed by `item_id`
- [ ] `find_field(segment, "estimated_arpu_aud")` returns the ARPU string regardless of whether it's top-level or nested under `economics`
- [ ] `parse_arpu_aud("AU$245/mo blended (mostly Growth)")` returns `245`
- [ ] `parse_arpu_aud("AU$280-330 blended (skew Growth)")` returns `305` (midpoint)
- [ ] `parse_priority("1 — Highest-priority Tier B segment")` returns `1`
- [ ] `parse_mrr_range("AU$2,900-6,100/mo at end of month 12")` returns `(2900, 6100)`
- [ ] `parse_phase("Phase 1 (months 0-3)")` returns `1`

**Verify:** `python -m pytest tests/scripts/quick_wins/test_loaders.py -v` → all pass

**Steps:**

- [ ] **Step 1: Write the implementation**

Create `scripts/quick_wins/loaders.py`:

```python
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


_NUM_RANGE = re.compile(r"AU?\$?\s*([\d,]+)\s*[-–]\s*([\d,]+)", re.IGNORECASE)
_NUM_SINGLE = re.compile(r"AU?\$?\s*([\d,]+)")
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
```

- [ ] **Step 2: Add tests for the helpers**

Append to `tests/scripts/quick_wins/test_loaders.py`:

```python
from scripts.quick_wins.loaders import (
    find_field,
    parse_arpu_aud,
    parse_mrr_range,
    parse_phase,
    parse_priority,
)


def test_find_field_top_level():
    seg = {"name": "X", "tier": "A"}
    assert find_field(seg, "tier") == "A"


def test_find_field_nested_in_economics():
    seg = {"economics": {"estimated_arpu_aud": "AU$245/mo"}}
    assert find_field(seg, "estimated_arpu_aud") == "AU$245/mo"


def test_find_field_missing_returns_none():
    assert find_field({}, "missing") is None


def test_parse_arpu_single():
    assert parse_arpu_aud("AU$245/mo blended (mostly Growth)") == 245


def test_parse_arpu_range_returns_midpoint():
    assert parse_arpu_aud("AU$280-330 blended") == 305


def test_parse_arpu_none():
    assert parse_arpu_aud(None) is None


def test_parse_arpu_already_int():
    assert parse_arpu_aud(210) == 210


def test_parse_mrr_range_basic():
    assert parse_mrr_range("AU$2,900-6,100/mo at end of month 12") == (2900, 6100)


def test_parse_mrr_range_single_number():
    assert parse_mrr_range("AU$1,000/mo") == (1000, 1000)


def test_parse_mrr_range_none():
    assert parse_mrr_range(None) is None


def test_parse_priority_leading_digit():
    assert parse_priority("1 — Highest-priority Tier B segment") == 1


def test_parse_priority_just_int():
    assert parse_priority(2) == 2


def test_parse_phase():
    assert parse_phase("Phase 1 (months 0-3)") == 1
    assert parse_phase("Phase 2 (months 3-6)") == 2
    assert parse_phase("n/a — modeling") is None
```

- [ ] **Step 3: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_loaders.py -v
```

Expected: 14 passed (1 initial + 13 new).

- [ ] **Step 4: Commit**

```bash
git add scripts/quick_wins/loaders.py tests/scripts/quick_wins/test_loaders.py
git commit -m "feat(quick-wins): JSON loaders + field/value parsers"
```

---

## Task 3: 9-segment filter

**Goal:** Filter the 30 segments to the 9 quick wins using `rollout_phase`, `priority_ranking`, and `addressable_window`.

**Files:**
- Create: `scripts/quick_wins/filters.py`
- Create: `tests/scripts/quick_wins/test_filters.py`

**Acceptance Criteria:**
- [ ] `filter_quick_wins(segments)` returns exactly 9 segments
- [ ] All returned segments have `parse_phase(rollout_phase) == 1`
- [ ] All returned segments have `parse_priority(priority_ranking) <= 2`
- [ ] `addressable_window` lower-cased starts with `"now"` for all returned
- [ ] Returned list contains the expected IDs: `01_indie_cosmetics_skincare`, `04_candle_soap_homefragrance`, `08_pet_treats_dry`, `11_packaged_foods_sauces_condiments`, `14_functional_ferment_brands`, `16_katana_defectors`, `17_craftybase_graduates`, `19_unleashed_defectors_anz`, `21_shopify_plus_no_ops_stack`

**Verify:** `python -m pytest tests/scripts/quick_wins/test_filters.py -v` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/quick_wins/test_filters.py`:

```python
from pathlib import Path

from scripts.quick_wins.filters import filter_quick_wins
from scripts.quick_wins.loaders import load_segments

EXPECTED_IDS = {
    "01_indie_cosmetics_skincare",
    "04_candle_soap_homefragrance",
    "08_pet_treats_dry",
    "11_packaged_foods_sauces_condiments",
    "14_functional_ferment_brands",
    "16_katana_defectors",
    "17_craftybase_graduates",
    "19_unleashed_defectors_anz",
    "21_shopify_plus_no_ops_stack",
}


def test_filter_returns_nine_quick_wins():
    segments = load_segments(Path("docs/research/manuva-gtm/results"))
    quick_wins = filter_quick_wins(segments)
    assert {s["item_id"] for s in quick_wins} == EXPECTED_IDS


def test_filter_preserves_order_by_priority_then_mrr():
    """Returned list is sorted by (priority asc, mrr_upper desc) for stable rendering."""
    segments = load_segments(Path("docs/research/manuva-gtm/results"))
    quick_wins = filter_quick_wins(segments)
    # Priority 1 segments come first.
    from scripts.quick_wins.loaders import find_field, parse_priority
    priorities = [parse_priority(find_field(s, "priority_ranking")) for s in quick_wins]
    assert priorities == sorted(priorities)
```

- [ ] **Step 2: Run test, expect ModuleNotFoundError**

```bash
python -m pytest tests/scripts/quick_wins/test_filters.py -v
```

- [ ] **Step 3: Implement the filter**

Create `scripts/quick_wins/filters.py`:

```python
"""Filter the 30 GTM segments down to the 9 quick wins."""
from __future__ import annotations

from .loaders import find_field, parse_mrr_range, parse_phase, parse_priority


def _is_addressable_now(segment: dict) -> bool:
    aw = find_field(segment, "addressable_window")
    if not aw:
        return False
    return str(aw).strip().lower().startswith("now")


def filter_quick_wins(segments: dict[str, dict]) -> list[dict]:
    """Return the Phase-1, priority≤2, addressable-now segments, sorted for display."""
    qw: list[dict] = []
    for seg in segments.values():
        phase = parse_phase(find_field(seg, "rollout_phase"))
        priority = parse_priority(find_field(seg, "priority_ranking"))
        if phase == 1 and priority is not None and priority <= 2 and _is_addressable_now(seg):
            qw.append(seg)

    def sort_key(s: dict) -> tuple[int, int]:
        p = parse_priority(find_field(s, "priority_ranking")) or 99
        mrr = parse_mrr_range(find_field(s, "realistic_12mo_mrr_contribution_aud"))
        mrr_upper = -(mrr[1] if mrr else 0)  # neg for desc
        return (p, mrr_upper)

    qw.sort(key=sort_key)
    return qw
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_filters.py -v
```

Expected: 2 passed. If `test_filter_returns_nine_quick_wins` fails because the actual `addressable_window` strings in the JSON don't start with "now", capture the actual values and broaden the matcher (e.g. accept "now" anywhere in the first sentence). Adjust the function rather than the test.

- [ ] **Step 5: Commit**

```bash
git add scripts/quick_wins/filters.py tests/scripts/quick_wins/test_filters.py
git commit -m "feat(quick-wins): filter to 9 Phase-1 priority segments"
```

---

## Task 4: 90-day plan parser

**Goal:** Parse `docs/marketing/90-day-gtm-plan.md` into a list of tasks with `week`, `phase`, and `text` fields. The plan structure is consistent: `### Week N (date range)` headings, followed by numbered `1. ... **Deliverable: ...**` items.

**Files:**
- Create: `scripts/quick_wins/plan_parser.py`
- Create: `tests/scripts/quick_wins/test_plan_parser.py`

**Acceptance Criteria:**
- [ ] `parse_plan(Path("docs/marketing/90-day-gtm-plan.md"))` returns a list of `PlanTask` namedtuples (or dicts)
- [ ] Each task has `week` (int 1-12), `phase` (str "A"/"B"/"C"), `index` (int — task position within the week, 1-based), `text` (str — full task body without leading number), `deliverable` (str — extracted "Deliverable:" sentence)
- [ ] Total task count matches the plan (~60 tasks across 12 weeks; verify exact count from the file)
- [ ] Week 1 has 5 tasks, Week 12 has 5 tasks
- [ ] Day-90 review items (plan §6) are returned by a separate function `parse_day_90_review(...)` as a list of strings

**Verify:** `python -m pytest tests/scripts/quick_wins/test_plan_parser.py -v` → all pass

**Steps:**

- [ ] **Step 1: Inspect the plan structure**

```bash
grep -n "^####\? Week" docs/marketing/90-day-gtm-plan.md
```

Confirm headings are `#### Week N (date range)`. Also check `### Phase A` / `### Phase B` / `### Phase C` boundaries.

- [ ] **Step 2: Write the failing test**

Create `tests/scripts/quick_wins/test_plan_parser.py`:

```python
from pathlib import Path

from scripts.quick_wins.plan_parser import parse_day_90_review, parse_plan

PLAN_PATH = Path("docs/marketing/90-day-gtm-plan.md")


def test_parse_plan_returns_tasks_for_all_12_weeks():
    tasks = parse_plan(PLAN_PATH)
    weeks = {t["week"] for t in tasks}
    assert weeks == set(range(1, 13))


def test_parse_plan_week_1_has_5_tasks():
    tasks = parse_plan(PLAN_PATH)
    w1 = [t for t in tasks if t["week"] == 1]
    assert len(w1) == 5
    assert w1[0]["index"] == 1


def test_parse_plan_tasks_have_required_fields():
    tasks = parse_plan(PLAN_PATH)
    for t in tasks:
        assert set(t.keys()) >= {"week", "phase", "index", "text", "deliverable"}
        assert isinstance(t["week"], int)
        assert t["phase"] in {"A", "B", "C"}


def test_parse_plan_extracts_deliverable():
    tasks = parse_plan(PLAN_PATH)
    w1_t1 = next(t for t in tasks if t["week"] == 1 and t["index"] == 1)
    assert "live URL" in w1_t1["deliverable"]


def test_parse_day_90_review_returns_non_empty_list():
    items = parse_day_90_review(PLAN_PATH)
    assert len(items) >= 5
    assert all(isinstance(x, str) and x for x in items)
```

- [ ] **Step 3: Implement the parser**

Create `scripts/quick_wins/plan_parser.py`:

```python
"""Parse docs/marketing/90-day-gtm-plan.md into structured task records."""
from __future__ import annotations

import re
from pathlib import Path
from typing import TypedDict


class PlanTask(TypedDict):
    week: int
    phase: str
    index: int
    text: str
    deliverable: str


_PHASE_HEADING = re.compile(r"^###\s+Phase\s+([A-C])\b", re.MULTILINE)
_WEEK_HEADING = re.compile(r"^####\s+Week\s+(\d+)\b", re.MULTILINE)
_TASK_LINE = re.compile(r"^(\d+)\.\s+(.*)$")
_DELIVERABLE_RE = re.compile(r"\*\*Deliverable:\*\*\s*([^\n]+?)(?:\*\*|$)", re.IGNORECASE)


def _split_into_week_sections(content: str) -> list[tuple[str, int, str]]:
    """Yield (phase_letter, week_number, week_body) tuples in document order."""
    sections: list[tuple[str, int, str]] = []
    phase_matches = list(_PHASE_HEADING.finditer(content))
    for i, pm in enumerate(phase_matches):
        phase = pm.group(1)
        phase_start = pm.end()
        phase_end = phase_matches[i + 1].start() if i + 1 < len(phase_matches) else len(content)
        phase_body = content[phase_start:phase_end]
        week_matches = list(_WEEK_HEADING.finditer(phase_body))
        for j, wm in enumerate(week_matches):
            week_num = int(wm.group(1))
            w_start = wm.end()
            w_end = week_matches[j + 1].start() if j + 1 < len(week_matches) else len(phase_body)
            sections.append((phase, week_num, phase_body[w_start:w_end]))
    return sections


def parse_plan(plan_path: Path) -> list[PlanTask]:
    content = plan_path.read_text(encoding="utf-8")
    tasks: list[PlanTask] = []
    for phase, week_num, body in _split_into_week_sections(content):
        for line in body.splitlines():
            m = _TASK_LINE.match(line.lstrip())
            if not m:
                continue
            idx = int(m.group(1))
            text = m.group(2).strip()
            deliv_m = _DELIVERABLE_RE.search(text)
            deliverable = deliv_m.group(1).strip().rstrip(" *.") if deliv_m else ""
            tasks.append(PlanTask(
                week=week_num,
                phase=phase,
                index=idx,
                text=text,
                deliverable=deliverable,
            ))
    return tasks


def parse_day_90_review(plan_path: Path) -> list[str]:
    """Extract the numbered items under '## 6. Day 90 review checklist'."""
    content = plan_path.read_text(encoding="utf-8")
    # Section 6 spans from '## 6. Day 90' to the next '## ' heading.
    m = re.search(r"^##\s+6\.\s+Day\s+90.*?(?=^##\s+)", content, re.MULTILINE | re.DOTALL)
    if not m:
        return []
    section = m.group(0)
    # Decision points are listed as "1. **Heading** — body."
    items = re.findall(r"^(\d+\.\s+\*\*[^*]+\*\*[^\n]*)", section, re.MULTILINE)
    return [it.strip() for it in items]
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_plan_parser.py -v
```

Expected: 5 passed. If the deliverable regex misses a known case, adjust the regex *and* add the failing case as a new test before fixing.

- [ ] **Step 5: Commit**

```bash
git add scripts/quick_wins/plan_parser.py tests/scripts/quick_wins/test_plan_parser.py
git commit -m "feat(quick-wins): parse 90-day plan markdown into tasks"
```

---

## Task 5: Workstream + segment mapping tables

**Goal:** Implement the workstream classifier and segment-keyword tables from the spec §11 so each parsed plan task can be tagged with `workstream` (Build/Sell/Support/Content) and `segments_mentioned` (list of segment IDs).

**Files:**
- Create: `scripts/quick_wins/mapping.py`
- Create: `tests/scripts/quick_wins/test_mapping.py`

**Acceptance Criteria:**
- [ ] `classify_workstream(text)` returns one of `{"Build", "Sell", "Support", "Content"}` per the verb table
- [ ] `match_segments(text)` returns a list of segment IDs matched via the keyword table; empty list when no match
- [ ] Returned task list from `annotate_tasks(plan_tasks)` has every task tagged with both fields
- [ ] A task containing "Send 30 personalised Charter invites" → `Sell`, segments includes `01_indie_cosmetics_skincare` AND `04_candle_soap_homefragrance` (mentions both groups)
- [ ] A task containing "Ship Xero OAuth + connection screen" → `Build`, segments = `[]` (cross-cutting)
- [ ] A task containing "Publish pillar post #1" → `Content`

**Verify:** `python -m pytest tests/scripts/quick_wins/test_mapping.py -v` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/quick_wins/test_mapping.py`:

```python
import pytest

from scripts.quick_wins.mapping import classify_workstream, match_segments


@pytest.mark.parametrize("text,expected", [
    ("Ship Xero OAuth + connection screen.", "Build"),
    ("Build Craftybase CSV import wizard v1.", "Build"),
    ("Publish Charter Partner Program landing page.", "Build"),
    ("Send 30 personalised Charter invites.", "Sell"),
    ("Run 8-12 Charter discovery calls.", "Sell"),
    ("Post in 'Australian candle makers' FB group: a value-first post.", "Content"),
    ("Publish pillar post #1: 'Outgrowing Craftybase'.", "Content"),
    ("Run first bi-weekly cadence calls with all 5 Charter Partners.", "Support"),
    ("Onboard 1 Charter Partner via the wizard as a dogfood test.", "Support"),
])
def test_classify_workstream(text, expected):
    assert classify_workstream(text) == expected


def test_match_segments_candle_and_soap():
    text = "Send 12 candle/soap makers from the 'Australian Soapmakers' Facebook group."
    assert "04_candle_soap_homefragrance" in match_segments(text)


def test_match_segments_katana_defectors():
    text = "Build Katana real-cost calculator embedded on /compare."
    assert "16_katana_defectors" in match_segments(text)


def test_match_segments_craftybase():
    text = "Publish pillar post #1: 'Outgrowing Craftybase' for AU candle and soap makers."
    matches = match_segments(text)
    assert "17_craftybase_graduates" in matches
    assert "04_candle_soap_homefragrance" in matches


def test_match_segments_no_keyword_returns_empty():
    text = "Ship Xero OAuth + connection screen."
    assert match_segments(text) == []
```

- [ ] **Step 2: Implement mapping**

Create `scripts/quick_wins/mapping.py`:

```python
"""Workstream and segment-keyword classifiers for plan tasks."""
from __future__ import annotations

import re

# Order matters: first match wins. Build/Sell/Content/Support roughly in priority.
WORKSTREAM_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("Content", re.compile(r"\b(publish|post in|launch (a )?webinar|submit a (speaker|.+) (pitch|application)|write (the )?(pillar|draft)|content hub|carousel)\b", re.I)),
    ("Build", re.compile(r"\b(ship|build|draft (the )?(Xero|spec|epic)|deploy|set up (a|the) (dashboard|metrics)|develop)\b", re.I)),
    ("Sell", re.compile(r"\b(send (\d+|outreach|.+ DMs?|.+ invites?)|DM|outreach|run (\d+|.+) (discovery|demo|pilot|paid|inbound|outbound|advisor|cold)|sign|convert (\d+|.+) pilot|pitch|reach out|schedule (\d+|.+) (intro )?(Zoom )?calls?)\b", re.I)),
    ("Support", re.compile(r"\b(run (the |first |second |third |fourth )?(bi-weekly|cadence|charter)|onboard|triage|run the .+ (review|cadence call)|review session)\b", re.I)),
]

# Fallback if nothing matches: classify by the first verb.
_FALLBACK_VERBS = {
    "publish": "Content",
    "ship": "Build",
    "build": "Build",
    "send": "Sell",
    "run": "Sell",
    "post": "Content",
    "write": "Content",
}


def classify_workstream(text: str) -> str:
    """Return one of Build/Sell/Support/Content."""
    for ws, pat in WORKSTREAM_RULES:
        if pat.search(text):
            return ws
    first_word = text.lstrip().split()[0].lower().strip("*:.,") if text.strip() else ""
    return _FALLBACK_VERBS.get(first_word, "Build")


# (segment_id, list of case-insensitive keyword substrings)
SEGMENT_KEYWORDS: dict[str, list[str]] = {
    "01_indie_cosmetics_skincare": ["cosmetic", "skincare", "indie beauty", "Jennifer Rudd", "Skincare Business Foundations", "Beauty Industry Group"],
    "04_candle_soap_homefragrance": ["candle", "soap", "home fragrance", "Australian Candle Makers", "Australian Soapmakers", "Australian Soap Makers"],
    "08_pet_treats_dry": ["pet treat", "dry pet food"],
    "11_packaged_foods_sauces_condiments": ["packaged food", "sauce", "condiment", "FSANZ"],
    "14_functional_ferment_brands": ["ferment", "kombucha", "sauerkraut", "kimchi"],
    "16_katana_defectors": ["Katana", "real-cost calculator", "Brahmin Solutions"],
    "17_craftybase_graduates": ["Craftybase", "Indie tier"],
    "19_unleashed_defectors_anz": ["Unleashed", "NZD billing", "NZD-billed"],
    "21_shopify_plus_no_ops_stack": ["Shopify Plus", "Plus brand"],
}


def match_segments(text: str) -> list[str]:
    """Return all segment IDs whose keyword table matches text (case-insensitive)."""
    text_lower = text.lower()
    return [
        seg_id for seg_id, keywords in SEGMENT_KEYWORDS.items()
        if any(kw.lower() in text_lower for kw in keywords)
    ]


def annotate_tasks(tasks: list[dict]) -> list[dict]:
    """Add workstream + segments_mentioned to each task dict."""
    out = []
    for t in tasks:
        out.append({
            **t,
            "workstream": classify_workstream(t["text"]),
            "segments_mentioned": match_segments(t["text"]),
        })
    return out
```

- [ ] **Step 3: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_mapping.py -v
```

Expected: 13 passed (9 parametrized workstream + 4 segment).

- [ ] **Step 4: Commit**

```bash
git add scripts/quick_wins/mapping.py tests/scripts/quick_wins/test_mapping.py
git commit -m "feat(quick-wins): workstream classifier + segment keyword matching"
```

---

## Task 6: KPI math

**Goal:** Compute the four KPI values (total 12-mo MRR upper bound, blended ARPU, founder hours breakdown, addressable-today count).

**Files:**
- Create: `scripts/quick_wins/kpis.py`
- Create: `tests/scripts/quick_wins/test_kpis.py`

**Acceptance Criteria:**
- [ ] `compute_kpis(quick_wins)` returns a dict with keys: `total_mrr_upper_aud`, `blended_arpu_aud`, `founder_hours`, `addressable_today_count`, `addressable_after_xero_count`
- [ ] `total_mrr_upper_aud` = sum of `parse_mrr_range(...)[1]` across all 9
- [ ] `blended_arpu_aud` = weighted mean of `parse_arpu_aud` weighted by MRR-upper
- [ ] `founder_hours = {"total": 40, "build": 16, "sell": 12, "support": 6, "content": 6}` (constant from plan §2)
- [ ] `addressable_today_count` = count where `roadmap_dependency` does not mention `xero|myob|quickbooks|woocommerce|amazon` (case-insensitive)
- [ ] `addressable_after_xero_count` = the 9 minus today's count

**Verify:** `python -m pytest tests/scripts/quick_wins/test_kpis.py -v` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test with fixtures**

Create `tests/scripts/quick_wins/test_kpis.py`:

```python
from scripts.quick_wins.kpis import compute_kpis


SEG_A = {
    "item_id": "a",
    "economics": {"estimated_arpu_aud": "AU$245"},
    "fit_and_timing": {"roadmap_dependency": "Lot tracking already shipping"},
    "realistic_12mo_mrr_contribution_aud": "AU$2,000-4,000",
}
SEG_B = {
    "item_id": "b",
    "economics": {"estimated_arpu_aud": "AU$300-400"},
    "fit_and_timing": {"roadmap_dependency": "Xero integration significantly increases close rate."},
    "realistic_12mo_mrr_contribution_aud": "AU$1,000-2,000",
}


def test_total_mrr_upper():
    kpis = compute_kpis([SEG_A, SEG_B])
    assert kpis["total_mrr_upper_aud"] == 4000 + 2000


def test_blended_arpu_weighted_by_mrr_upper():
    # SEG_A: arpu 245 * weight 4000 ; SEG_B: arpu 350 * weight 2000
    # Weighted mean = (245*4000 + 350*2000) / 6000 = (980000 + 700000) / 6000 = 280
    kpis = compute_kpis([SEG_A, SEG_B])
    assert kpis["blended_arpu_aud"] == 280


def test_founder_hours_constant():
    kpis = compute_kpis([])
    assert kpis["founder_hours"] == {"total": 40, "build": 16, "sell": 12, "support": 6, "content": 6}


def test_addressable_today_when_no_roadmap_block():
    kpis = compute_kpis([SEG_A, SEG_B])
    assert kpis["addressable_today_count"] == 1  # only SEG_A
    assert kpis["addressable_after_xero_count"] == 1


def test_handles_empty_input():
    kpis = compute_kpis([])
    assert kpis["total_mrr_upper_aud"] == 0
    assert kpis["blended_arpu_aud"] == 0
    assert kpis["addressable_today_count"] == 0
```

- [ ] **Step 2: Implement KPIs**

Create `scripts/quick_wins/kpis.py`:

```python
"""KPI computations for the quick-wins dashboard."""
from __future__ import annotations

import re

from .loaders import find_field, parse_arpu_aud, parse_mrr_range

ROADMAP_BLOCKERS = re.compile(r"\b(xero|myob|quickbooks|woocommerce|amazon)\b", re.IGNORECASE)
FOUNDER_HOURS = {"total": 40, "build": 16, "sell": 12, "support": 6, "content": 6}


def compute_kpis(quick_wins: list[dict]) -> dict:
    total_mrr_upper = 0
    weighted_arpu = 0
    weight_sum = 0
    addressable_today = 0
    for seg in quick_wins:
        mrr = parse_mrr_range(find_field(seg, "realistic_12mo_mrr_contribution_aud"))
        arpu = parse_arpu_aud(find_field(seg, "estimated_arpu_aud"))
        if mrr is None or arpu is None:
            continue
        upper = mrr[1]
        total_mrr_upper += upper
        weighted_arpu += arpu * upper
        weight_sum += upper

        roadmap = find_field(seg, "roadmap_dependency") or ""
        if not ROADMAP_BLOCKERS.search(str(roadmap)):
            addressable_today += 1

    blended = weighted_arpu // weight_sum if weight_sum else 0
    return {
        "total_mrr_upper_aud": total_mrr_upper,
        "blended_arpu_aud": blended,
        "founder_hours": FOUNDER_HOURS.copy(),
        "addressable_today_count": addressable_today,
        "addressable_after_xero_count": len(quick_wins) - addressable_today,
    }
```

- [ ] **Step 3: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_kpis.py -v
```

Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add scripts/quick_wins/kpis.py tests/scripts/quick_wins/test_kpis.py
git commit -m "feat(quick-wins): KPI math (MRR total, blended ARPU, addressable counts)"
```

---

## Task 7: Chart datasets

**Goal:** Build the data payloads the front-end will hand to Chart.js (bar + scatter) and the SVG Gantt (workstream swimlanes × 12 weeks).

**Files:**
- Create: `scripts/quick_wins/charts.py`
- Create: `tests/scripts/quick_wins/test_charts.py`

**Acceptance Criteria:**
- [ ] `build_bar_dataset(quick_wins)` returns `{"labels": [...9 names...], "data": [...9 MRR-upper ints...], "colors": [...9 hex strings keyed to priority...]}`
- [ ] `build_scatter_dataset(quick_wins)` returns a list of 9 `{x: ttv_days, y: arpu, r: fit_score*4, motion: "...", label: "name"}` dicts
- [ ] `build_gantt_dataset(annotated_tasks)` returns 4 swimlane lists (Build/Sell/Support/Content), each with `{week: int, text: str, deliverable: str}` entries
- [ ] Bar labels are short segment names (drop "(cross-vertical)", "(AU)" suffixes for chart legibility)
- [ ] Scatter `r` (radius) is clamped to `[4, 24]`

**Verify:** `python -m pytest tests/scripts/quick_wins/test_charts.py -v` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/quick_wins/test_charts.py`:

```python
import pytest

from scripts.quick_wins.charts import (
    build_bar_dataset,
    build_gantt_dataset,
    build_scatter_dataset,
)

SEG = {
    "item_id": "16_katana_defectors",
    "name": "Katana defectors (cross-vertical)",
    "economics": {"estimated_arpu_aud": "AU$245"},
    "fit_and_timing": {
        "manuva_fit_score": 4,
        "time_to_value_days": "7-14 days. Most defectors...",
    },
    "foot_in_door_fit": {
        "recommended_foot_in_door_motion": "Founder-led inbound funnel + 14-day CC-required trial",
    },
    "realistic_12mo_mrr_contribution_aud": "AU$2,900-6,100/mo at end of month 12",
    "priority_ranking": "1 — Highest",
}


def test_bar_dataset_shape():
    ds = build_bar_dataset([SEG])
    assert ds["labels"] == ["Katana defectors"]
    assert ds["data"] == [6100]
    assert ds["colors"][0].startswith("#")


def test_scatter_dataset_clamps_radius():
    ds = build_scatter_dataset([SEG])
    point = ds[0]
    assert point["x"] == 10  # (7+14)/2 midpoint
    assert point["y"] == 245
    assert 4 <= point["r"] <= 24
    assert "label" in point and "motion" in point


def test_gantt_dataset_has_four_swimlanes():
    annotated = [
        {"week": 1, "workstream": "Build", "text": "Ship Xero", "deliverable": "PR merged"},
        {"week": 1, "workstream": "Sell", "text": "Send DMs", "deliverable": "30 sent"},
    ]
    ds = build_gantt_dataset(annotated)
    assert set(ds.keys()) == {"Build", "Sell", "Support", "Content"}
    assert len(ds["Build"]) == 1
    assert ds["Build"][0]["week"] == 1
```

- [ ] **Step 2: Implement charts**

Create `scripts/quick_wins/charts.py`:

```python
"""Build chart datasets from quick-win segments and annotated tasks."""
from __future__ import annotations

import re

from .loaders import find_field, parse_arpu_aud, parse_mrr_range, parse_priority

# Manuva-style colours; will be overridden by --brand-* tokens at render time
# via CSS custom-property lookup in the JS layer (Chart.js getComputedStyle).
PRIORITY_COLORS = {
    1: "#0E5BFF",  # placeholder until tokens resolve
    2: "#5B8DEF",
    3: "#9CB5F2",
}
DEFAULT_COLOR = "#A0A6B3"

_NAME_SUFFIX = re.compile(r"\s*[\(\[][^)\]]*[\)\]]\s*$")
_TTV_RANGE = re.compile(r"(\d+)\s*[-–]\s*(\d+)")
_TTV_SINGLE = re.compile(r"(\d+)")


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
        fit = find_field(seg, "manuva_fit_score") or 3
        if arpu is None:
            continue
        points.append({
            "x": ttv,
            "y": arpu,
            "r": _clamp(int(fit) * 4, 4, 24),
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
```

- [ ] **Step 3: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_charts.py -v
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add scripts/quick_wins/charts.py tests/scripts/quick_wins/test_charts.py
git commit -m "feat(quick-wins): chart datasets (bar + scatter + gantt)"
```

---

## Task 8: Style loader with fallback tokens

**Goal:** Load `colors_and_type.css` from `C:\dev\manuva-tokens\Manuva Design System\` when available, otherwise emit a hard-coded fallback token block so the build still succeeds on machines without the tokens repo.

**Files:**
- Create: `scripts/quick_wins/style_loader.py`
- Create: `tests/scripts/quick_wins/test_style_loader.py`

**Acceptance Criteria:**
- [ ] `load_tokens()` returns a CSS string containing `--brand-1` and `--ink-strong` either from file or fallback
- [ ] When the canonical path exists, the function returns its contents verbatim
- [ ] When the canonical path is missing, returns the fallback constant and `warnings.warn` fires
- [ ] Optional override path argument honoured for testability

**Verify:** `python -m pytest tests/scripts/quick_wins/test_style_loader.py -v` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/quick_wins/test_style_loader.py`:

```python
import warnings
from pathlib import Path

import pytest

from scripts.quick_wins.style_loader import FALLBACK_TOKENS, load_tokens


def test_load_tokens_uses_fallback_when_missing(tmp_path):
    bogus = tmp_path / "missing.css"
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        css = load_tokens(canonical_path=bogus)
        assert css == FALLBACK_TOKENS
        assert any("colors_and_type.css" in str(rec.message) for rec in w)


def test_load_tokens_reads_existing_file(tmp_path):
    css_file = tmp_path / "tokens.css"
    css_file.write_text(":root { --brand-1: #abc; --ink-strong: #000; }", encoding="utf-8")
    assert load_tokens(canonical_path=css_file).startswith(":root")


def test_fallback_contains_required_tokens():
    assert "--brand-1" in FALLBACK_TOKENS
    assert "--ink-strong" in FALLBACK_TOKENS
    assert "--bg-card" in FALLBACK_TOKENS
```

- [ ] **Step 2: Implement style loader**

Create `scripts/quick_wins/style_loader.py`:

```python
"""Load Manuva design tokens with a fallback for machines without the tokens repo."""
from __future__ import annotations

import warnings
from pathlib import Path

CANONICAL_TOKENS_PATH = Path(r"C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css")

# Minimal fallback. Values mirror the documented Manuva palette in CLAUDE.md.
# Replace by checking the canonical file into the repo or syncing the tokens dir.
FALLBACK_TOKENS = """:root {
  --brand-1: #0E5BFF;
  --brand-1-soft: #E6EEFF;
  --brand-2: #1B2433;
  --ink-strong: #0F1320;
  --ink-muted: #5A6273;
  --bg-card: #FFFFFF;
  --bg-canvas: #F5F7FB;
  --border-subtle: #E3E7EE;
  --success: #1AA563;
  --warning: #F0A91E;
  --danger: #E04646;
  --priority-1: var(--brand-1);
  --priority-2: #5B8DEF;
  --priority-3: #9CB5F2;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
body { color: var(--ink-strong); background: var(--bg-canvas); }
"""


def load_tokens(canonical_path: Path | None = None) -> str:
    path = canonical_path or CANONICAL_TOKENS_PATH
    if path.exists():
        return path.read_text(encoding="utf-8")
    warnings.warn(
        f"colors_and_type.css not found at {path}; using fallback tokens.",
        stacklevel=2,
    )
    return FALLBACK_TOKENS
```

- [ ] **Step 3: Run tests**

```bash
python -m pytest tests/scripts/quick_wins/test_style_loader.py -v
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add scripts/quick_wins/style_loader.py tests/scripts/quick_wins/test_style_loader.py
git commit -m "feat(quick-wins): style loader with fallback Manuva tokens"
```

---

## Task 9: Jinja2 template — HTML structure

**Goal:** Author the Jinja2 template that assembles the final HTML: header nav, 4 KPI cards, two `<canvas>` elements for Chart.js, a `<svg>` Gantt, 9 segment cards, week-by-week checklist, Day-90 review, 5 Charter slot tiles, filter strip. No JS yet — just static rendering.

**Files:**
- Create: `scripts/quick_wins/templates/quick-wins.html.j2`

**Acceptance Criteria:**
- [ ] Template renders with no Jinja errors given the context shape `{kpis, segments, charts, weeks, day90, charter_slots, tokens_css}`
- [ ] Template references variables that exist (no undefined-variable runtime errors when rendered with valid context)
- [ ] Uses semantic HTML — `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`
- [ ] Loads Chart.js 4.x from `cdn.jsdelivr.net` (pinned version)
- [ ] All segment-card metric formatting (e.g., "AU$245", "2.9–6.1k") is done in template filters, not in Python

**Verify:** Tested as part of Task 11 integration test. For now: hand-render with a stub.

**Steps:**

- [ ] **Step 1: Write the template**

Create `scripts/quick_wins/templates/quick-wins.html.j2`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Manuva Quick Wins · GTM Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    {{ tokens_css | safe }}

    body { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; line-height: 1.45; }
    header.top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    header.top h1 { margin: 0; font-size: 28px; color: var(--ink-strong); }
    nav.anchors a { margin-right: 16px; color: var(--brand-1); text-decoration: none; font-size: 14px; }
    nav.anchors a:hover { text-decoration: underline; }
    .meta { color: var(--ink-muted); font-size: 13px; }

    section { margin-top: 48px; }
    section > h2 { margin-bottom: 8px; font-size: 20px; color: var(--ink-strong); }
    section > p.note { color: var(--ink-muted); font-size: 13px; margin-top: 0; }

    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 16px; }
    .kpi { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; }
    .kpi .label { color: var(--ink-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .kpi .value { font-size: 24px; font-weight: 600; margin-top: 4px; color: var(--ink-strong); }
    .kpi .sub { font-size: 12px; color: var(--ink-muted); margin-top: 4px; }
    .hour-bar { display: flex; height: 6px; margin-top: 6px; border-radius: 3px; overflow: hidden; }
    .hour-bar span { display: block; }

    .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
    .chart-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; }
    .chart-card h3 { margin: 0 0 8px; font-size: 14px; color: var(--ink-strong); }

    .filter-strip { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
    .filter-strip label { font-size: 12px; color: var(--ink-muted); display: flex; align-items: center; gap: 6px; }

    .segment-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .segment { background: var(--bg-card); border: 1px solid var(--border-subtle); border-left: 4px solid var(--priority-1); border-radius: 8px; padding: 16px; }
    .segment[data-priority="2"] { border-left-color: var(--priority-2); }
    .segment h3 { margin: 0; font-size: 16px; display: flex; justify-content: space-between; align-items: baseline; }
    .segment .priority-tag { font-size: 12px; color: var(--brand-1); }
    .segment .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; font-size: 13px; }
    .segment .metric .k { color: var(--ink-muted); font-size: 11px; text-transform: uppercase; }
    .segment .metric .v { color: var(--ink-strong); font-weight: 500; }
    .segment .motion { font-size: 13px; padding: 6px 8px; background: var(--brand-1-soft); color: var(--brand-2); border-radius: 4px; margin: 8px 0; }
    .segment details { margin-top: 8px; }
    .segment details summary { font-size: 13px; cursor: pointer; color: var(--brand-1); }
    .segment ul { margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; }
    .segment li label { cursor: pointer; }
    .segment li input[type=checkbox] { margin-right: 6px; }
    .segment .source { font-size: 12px; color: var(--ink-muted); margin-top: 8px; }

    .gantt { width: 100%; height: 360px; }
    .gantt .lane-label { font-size: 11px; fill: var(--ink-muted); text-transform: uppercase; }
    .gantt .week-line { stroke: var(--border-subtle); stroke-width: 1; }
    .gantt .task-block { rx: 3; ry: 3; }
    .gantt .task-block.Build { fill: var(--brand-1); }
    .gantt .task-block.Sell { fill: var(--success); }
    .gantt .task-block.Support { fill: var(--warning); }
    .gantt .task-block.Content { fill: var(--brand-2); }
    .gantt text.task-text { font-size: 10px; fill: white; }

    .week-list { columns: 2; column-gap: 32px; margin-top: 24px; }
    .week-list .week { break-inside: avoid; margin-bottom: 16px; }
    .week-list .week h4 { margin: 0 0 4px; font-size: 13px; color: var(--ink-strong); }
    .week-list .week ul { padding-left: 20px; margin: 0; font-size: 12px; }

    .charter-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 16px; }
    .charter-tile { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px; font-size: 13px; }
    .charter-tile select, .charter-tile input { width: 100%; padding: 4px; font-size: 12px; margin-top: 4px; }
    .charter-tile h4 { margin: 0; font-size: 13px; }

    .controls { display: flex; gap: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
    .controls button { font-size: 12px; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; }
  </style>
</head>
<body>

<header class="top">
  <div>
    <h1>Manuva Quick Wins</h1>
    <div class="meta">Generated {{ generated_at }} · 9 Phase-1 segments · 12-week plan</div>
  </div>
  <nav class="anchors">
    <a href="#overview">Overview</a>
    <a href="#segments">Segments</a>
    <a href="#plan">90-Day Plan</a>
    <a href="#charter">Charter</a>
  </nav>
</header>

<section id="overview">
  <h2>Overview</h2>
  <div class="kpis">
    <div class="kpi">
      <div class="label">12-mo MRR if all hit</div>
      <div class="value">AU${{ "{:,.0f}".format(kpis.total_mrr_upper_aud) }}</div>
      <div class="sub">Upper bound across 9 segments</div>
    </div>
    <div class="kpi">
      <div class="label">Blended ARPU</div>
      <div class="value">AU${{ kpis.blended_arpu_aud }}</div>
      <div class="sub">MRR-weighted</div>
    </div>
    <div class="kpi">
      <div class="label">Founder hours / wk</div>
      <div class="value">{{ kpis.founder_hours.total }} hr</div>
      <div class="hour-bar">
        <span style="background: var(--brand-1); width: {{ (kpis.founder_hours.build / kpis.founder_hours.total * 100) | round }}%"></span>
        <span style="background: var(--success); width: {{ (kpis.founder_hours.sell / kpis.founder_hours.total * 100) | round }}%"></span>
        <span style="background: var(--warning); width: {{ (kpis.founder_hours.support / kpis.founder_hours.total * 100) | round }}%"></span>
        <span style="background: var(--brand-2); width: {{ (kpis.founder_hours.content / kpis.founder_hours.total * 100) | round }}%"></span>
      </div>
      <div class="sub">Build {{ kpis.founder_hours.build }} · Sell {{ kpis.founder_hours.sell }} · Support {{ kpis.founder_hours.support }} · Content {{ kpis.founder_hours.content }}</div>
    </div>
    <div class="kpi">
      <div class="label">Addressable today</div>
      <div class="value">{{ kpis.addressable_today_count }} / 9</div>
      <div class="sub">+{{ kpis.addressable_after_xero_count }} after Xero ships</div>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-card"><h3>12-mo MRR potential (upper bound, AU$)</h3><canvas id="bar-mrr" height="180"></canvas></div>
    <div class="chart-card"><h3>ARPU × Time-to-value (bubble = Manuva fit)</h3><canvas id="scatter-arpu" height="180"></canvas></div>
  </div>
</section>

<section id="segments">
  <h2>Segments</h2>
  <div class="filter-strip">
    <label>Motion <select id="filter-motion"><option value="">All</option></select></label>
    <label>ARPU <select id="filter-arpu"><option value="">All</option><option value="0-200"><200</option><option value="200-300">200-300</option><option value="300-400">300-400</option><option value="400+">400+</option></select></label>
    <button id="clear-filters">Clear filters</button>
  </div>
  <div class="segment-grid">
    {% for s in segments %}
    <article class="segment" data-priority="{{ s.priority }}" data-arpu="{{ s.arpu }}" data-motion="{{ s.motion_short }}">
      <h3>
        <span>#{{ s.id_num }} · {{ s.name_short }}</span>
        <span class="priority-tag">★ P{{ s.priority }}</span>
      </h3>
      <div class="metrics">
        <div class="metric"><div class="k">ARPU</div><div class="v">AU${{ s.arpu }}</div></div>
        <div class="metric"><div class="k">12-mo MRR</div><div class="v">{{ s.mrr_str }}</div></div>
        <div class="metric"><div class="k">Time to value</div><div class="v">{{ s.ttv_days }}d</div></div>
        <div class="metric"><div class="k">Manuva fit</div><div class="v">{{ s.fit }}/5</div></div>
      </div>
      <div class="motion"><strong>Motion:</strong> {{ s.motion_short }}</div>
      <details>
        <summary>Where they live ({{ s.where_short | length }})</summary>
        <ul>
          {% for w in s.where_short %}<li>{{ w }}</li>{% endfor %}
        </ul>
      </details>
      <details open>
        <summary>This week ({{ s.this_week | length }})</summary>
        <ul>
          {% for t in s.this_week %}
          <li><label><input type="checkbox" data-task-id="w{{ '%02d' % t.week }}-t{{ '%02d' % t.index }}"> W{{ t.week }} · {{ t.text | truncate(120, true) }}</label></li>
          {% endfor %}
        </ul>
      </details>
      <details>
        <summary>This month ({{ s.this_month | length }})</summary>
        <ul>
          {% for t in s.this_month %}
          <li><label><input type="checkbox" data-task-id="w{{ '%02d' % t.week }}-t{{ '%02d' % t.index }}"> W{{ t.week }} · {{ t.text | truncate(120, true) }}</label></li>
          {% endfor %}
        </ul>
      </details>
      <div class="source">Source: <code>{{ s.source_file }}</code></div>
    </article>
    {% endfor %}
  </div>
</section>

<section id="plan">
  <h2>90-Day Plan</h2>
  <svg class="gantt" id="gantt-svg" viewBox="0 0 1100 360"></svg>
  <div class="week-list">
    {% for week in weeks %}
    <div class="week">
      <h4>Week {{ week.week }} · Phase {{ week.phase }}</h4>
      <ul>
        {% for t in week.tasks %}
        <li><label><input type="checkbox" data-task-id="w{{ '%02d' % t.week }}-t{{ '%02d' % t.index }}"> {{ t.text | truncate(140, true) }}</label></li>
        {% endfor %}
      </ul>
    </div>
    {% endfor %}
  </div>
  <h3 style="margin-top:24px">Day-90 review</h3>
  <ul>
    {% for d in day90 %}
    <li><label><input type="checkbox" data-task-id="d90-{{ loop.index }}"> {{ d }}</label></li>
    {% endfor %}
  </ul>
</section>

<section id="charter">
  <h2>Charter Program</h2>
  <p class="note">5 slots · 6mo free Pro then 50% off Pro for 24mo. State persists in localStorage.</p>
  <div class="charter-grid">
    {% for slot in charter_slots %}
    <div class="charter-tile" data-slot="{{ slot.number }}">
      <h4>Slot {{ slot.number }} · {{ slot.vertical }}</h4>
      <select data-field="status">
        {% for opt in ["Open", "Outreach", "In-talks", "Signed", "Withdrawn"] %}
        <option value="{{ opt }}"{% if opt == slot.status %} selected{% endif %}>{{ opt }}</option>
        {% endfor %}
      </select>
      <input data-field="contact" placeholder="Contact" value="{{ slot.contact }}">
      <input data-field="note" placeholder="Note" value="{{ slot.note }}">
    </div>
    {% endfor %}
  </div>
</section>

<div class="controls">
  <button id="reset-all">Reset all ticks</button>
  <button id="export-state">Export state to JSON</button>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script id="payload" type="application/json">{{ payload_json | safe }}</script>
<script>/* Filled in Task 10 */</script>

</body>
</html>
```

- [ ] **Step 2: Smoke-test the template renders**

```bash
python - <<'PY'
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

env = Environment(loader=FileSystemLoader("scripts/quick_wins/templates"))
tpl = env.get_template("quick-wins.html.j2")
ctx = {
  "generated_at": "2026-05-18",
  "tokens_css": ":root { --brand-1: #0E5BFF; }",
  "payload_json": "{}",
  "kpis": {"total_mrr_upper_aud": 0, "blended_arpu_aud": 0, "founder_hours": {"total": 40, "build": 16, "sell": 12, "support": 6, "content": 6}, "addressable_today_count": 0, "addressable_after_xero_count": 0},
  "segments": [], "weeks": [], "day90": [], "charter_slots": [],
}
html = tpl.render(**ctx)
assert "Manuva Quick Wins" in html
print("OK")
PY
```

Expected output: `OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/quick_wins/templates/quick-wins.html.j2
git commit -m "feat(quick-wins): HTML template (no JS yet)"
```

---

## Task 10: Client-side JS — Chart.js init, SVG Gantt, localStorage, filters

**Goal:** Replace the `<script>/* Filled in Task 10 */</script>` placeholder with the inline JS that wires up everything. Initialise Chart.js with the bar + scatter data; draw the SVG Gantt; rehydrate checkbox state from `localStorage`; wire filter strip; wire Charter slot inputs; wire Reset / Export.

**Files:**
- Modify: `scripts/quick_wins/templates/quick-wins.html.j2` — replace the placeholder script block

**Acceptance Criteria:**
- [ ] Bar chart renders with `payload.bar.labels` / `payload.bar.data` / `payload.bar.colors`
- [ ] Scatter chart renders with `payload.scatter` points; tooltip shows segment name + motion
- [ ] SVG Gantt draws 4 swimlanes × 12 columns; each task is a coloured rect positioned by `(week-1) * cellWidth` with `cellWidth = 1100/12`
- [ ] Ticking any checkbox writes to `localStorage["manuva:quick-wins:tasks"]`
- [ ] Reload preserves ticks
- [ ] Charter slot inputs persist to `localStorage["manuva:quick-wins:charter"]`
- [ ] Motion filter dropdown is populated from unique values present in segment cards
- [ ] Filter selection updates URL hash and re-renders bar + scatter (filter affects which cards show; charts compute from visible cards)
- [ ] Reset button clears both keys with `confirm()`
- [ ] Export button downloads a `manuva-quick-wins-state.json` blob

**Verify:** Manual — open `docs/marketing/quick-wins.html` in Chrome after Task 11. Specific checks listed there.

**Steps:**

- [ ] **Step 1: Replace the placeholder script block**

In `scripts/quick_wins/templates/quick-wins.html.j2`, replace the single placeholder script tag with:

```html
<script>
(() => {
  const payload = JSON.parse(document.getElementById('payload').textContent);
  const LS_TASKS = 'manuva:quick-wins:tasks';
  const LS_CHARTER = 'manuva:quick-wins:charter';

  // ── Charts ──────────────────────────────────────────────────────────────
  const bar = payload.bar;
  if (bar && document.getElementById('bar-mrr')) {
    new Chart(document.getElementById('bar-mrr'), {
      type: 'bar',
      data: { labels: bar.labels, datasets: [{ data: bar.data, backgroundColor: bar.colors, borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: v => 'AU$' + (v / 1000) + 'k' } } },
      },
    });
  }

  const scatter = payload.scatter;
  if (scatter && document.getElementById('scatter-arpu')) {
    new Chart(document.getElementById('scatter-arpu'), {
      type: 'bubble',
      data: { datasets: [{ data: scatter, backgroundColor: 'rgba(14,91,255,0.4)', borderColor: 'rgba(14,91,255,0.9)', borderWidth: 1 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => {
            const p = ctx.raw;
            return `${p.label} — ARPU AU$${p.y}, TTV ${p.x}d`;
          } } },
        },
        scales: {
          x: { title: { display: true, text: 'Time-to-value (days)' } },
          y: { title: { display: true, text: 'ARPU (AU$/mo)' } },
        },
      },
    });
  }

  // ── SVG Gantt ───────────────────────────────────────────────────────────
  const lanes = ['Build', 'Sell', 'Support', 'Content'];
  const svg = document.getElementById('gantt-svg');
  if (svg && payload.gantt) {
    const W = 1100, LH = 70, HEAD = 30, CELL = (W - 120) / 12;
    // Week headers
    for (let w = 1; w <= 12; w++) {
      const x = 120 + (w - 1) * CELL;
      svg.insertAdjacentHTML('beforeend', `<text x="${x + CELL / 2}" y="20" text-anchor="middle" font-size="11" fill="var(--ink-muted)">W${w}</text>`);
      svg.insertAdjacentHTML('beforeend', `<line class="week-line" x1="${x}" y1="${HEAD}" x2="${x}" y2="${HEAD + lanes.length * LH}" />`);
    }
    lanes.forEach((lane, i) => {
      const y = HEAD + i * LH;
      svg.insertAdjacentHTML('beforeend', `<text x="10" y="${y + LH / 2}" class="lane-label" dominant-baseline="middle">${lane}</text>`);
      (payload.gantt[lane] || []).forEach(t => {
        const x = 120 + (t.week - 1) * CELL + 2;
        const rect = `<rect class="task-block ${lane}" x="${x}" y="${y + 8}" width="${CELL - 4}" height="${LH - 16}">
          <title>${t.text.replace(/</g, '&lt;')}\n${t.deliverable.replace(/</g, '&lt;')}</title>
        </rect>`;
        svg.insertAdjacentHTML('beforeend', rect);
      });
    });
  }

  // ── localStorage: tasks ─────────────────────────────────────────────────
  const taskState = JSON.parse(localStorage.getItem(LS_TASKS) || '{}');
  document.querySelectorAll('input[type=checkbox][data-task-id]').forEach(cb => {
    const id = cb.dataset.taskId;
    if (taskState[id]) cb.checked = true;
    cb.addEventListener('change', () => {
      taskState[id] = cb.checked;
      localStorage.setItem(LS_TASKS, JSON.stringify(taskState));
    });
  });

  // ── localStorage: charter ───────────────────────────────────────────────
  const charterState = JSON.parse(localStorage.getItem(LS_CHARTER) || '{}');
  document.querySelectorAll('.charter-tile').forEach(tile => {
    const slot = tile.dataset.slot;
    const state = charterState[slot] || {};
    tile.querySelectorAll('[data-field]').forEach(el => {
      const f = el.dataset.field;
      if (state[f] != null) el.value = state[f];
      el.addEventListener('change', () => {
        charterState[slot] = { ...charterState[slot], [f]: el.value };
        localStorage.setItem(LS_CHARTER, JSON.stringify(charterState));
      });
    });
  });

  // ── Filter strip ────────────────────────────────────────────────────────
  const motions = new Set();
  document.querySelectorAll('.segment').forEach(c => motions.add(c.dataset.motion));
  const motionSel = document.getElementById('filter-motion');
  if (motionSel) {
    [...motions].sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      motionSel.appendChild(opt);
    });
  }

  function applyFilters() {
    const m = document.getElementById('filter-motion').value;
    const ab = document.getElementById('filter-arpu').value;
    document.querySelectorAll('.segment').forEach(c => {
      let show = true;
      if (m && c.dataset.motion !== m) show = false;
      if (ab) {
        const arpu = +c.dataset.arpu;
        const [lo, hi] = ab === '400+' ? [400, Infinity] : ab.split('-').map(Number);
        if (!(arpu >= lo && arpu < (hi || Infinity))) show = false;
      }
      c.style.display = show ? '' : 'none';
    });
    const hash = new URLSearchParams();
    if (m) hash.set('motion', m);
    if (ab) hash.set('arpu', ab);
    history.replaceState(null, '', hash.toString() ? '#' + hash : '#');
  }

  document.getElementById('filter-motion').addEventListener('change', applyFilters);
  document.getElementById('filter-arpu').addEventListener('change', applyFilters);
  document.getElementById('clear-filters').addEventListener('click', () => {
    document.getElementById('filter-motion').value = '';
    document.getElementById('filter-arpu').value = '';
    applyFilters();
  });

  // Restore from hash on load
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('motion')) document.getElementById('filter-motion').value = hash.get('motion');
  if (hash.get('arpu')) document.getElementById('filter-arpu').value = hash.get('arpu');
  applyFilters();

  // ── Reset / Export ──────────────────────────────────────────────────────
  document.getElementById('reset-all').addEventListener('click', () => {
    if (confirm('Reset all ticks and Charter slots?')) {
      localStorage.removeItem(LS_TASKS);
      localStorage.removeItem(LS_CHARTER);
      location.reload();
    }
  });
  document.getElementById('export-state').addEventListener('click', () => {
    const data = JSON.stringify({
      tasks: JSON.parse(localStorage.getItem(LS_TASKS) || '{}'),
      charter: JSON.parse(localStorage.getItem(LS_CHARTER) || '{}'),
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'manuva-quick-wins-state.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add scripts/quick_wins/templates/quick-wins.html.j2
git commit -m "feat(quick-wins): client-side JS (Chart.js, SVG Gantt, localStorage, filters)"
```

---

## Task 11: CLI entry point + integration test

**Goal:** Wire everything together in `scripts/build_quick_wins.py`. Add one integration test that runs the full pipeline against the real research files and asserts the produced HTML contains expected segment names, KPIs, and chart payload markers.

**Files:**
- Create: `scripts/build_quick_wins.py`
- Create: `tests/scripts/quick_wins/test_build.py`

**Acceptance Criteria:**
- [ ] `python scripts/build_quick_wins.py` produces `docs/marketing/quick-wins.html` with no errors
- [ ] The produced HTML contains the strings `"Katana defectors"`, `"AU$245"`, `"Outgrowing Craftybase"` (from plan task), and `"Chart.js"` (CDN script)
- [ ] The produced HTML contains a `<script id="payload">` with a valid JSON body parseable by `json.loads`
- [ ] Integration test passes
- [ ] CLI accepts optional `--out` flag to redirect output (useful for tests)

**Verify:**
```bash
python -m pytest tests/scripts/quick_wins/test_build.py -v
python scripts/build_quick_wins.py
```

**Steps:**

- [ ] **Step 1: Implement the CLI**

Create `scripts/build_quick_wins.py`:

```python
"""Build the Manuva Quick Wins HTML dashboard.

Usage:
    python scripts/build_quick_wins.py [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from scripts.quick_wins.charts import build_bar_dataset, build_gantt_dataset, build_scatter_dataset
from scripts.quick_wins.filters import filter_quick_wins
from scripts.quick_wins.kpis import compute_kpis
from scripts.quick_wins.loaders import (
    find_field,
    load_segments,
    parse_arpu_aud,
    parse_mrr_range,
    parse_priority,
)
from scripts.quick_wins.mapping import annotate_tasks
from scripts.quick_wins.plan_parser import parse_day_90_review, parse_plan
from scripts.quick_wins.style_loader import load_tokens

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "docs/research/manuva-gtm/results"
OUTLINE = ROOT / "docs/research/manuva-gtm/outline.yaml"
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


def _build_segment_view(seg: dict, annotated_tasks: list[dict], current_week: int) -> dict:
    """Build the per-segment view-model the template consumes."""
    item_id = seg["item_id"]
    seg_tasks = [t for t in annotated_tasks if item_id in t.get("segments_mentioned", [])]
    this_week = [t for t in seg_tasks if t["week"] == current_week]
    this_month = [t for t in seg_tasks if current_week <= t["week"] < current_week + 4]

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
        "this_week": this_week or [{"week": current_week, "index": 0, "text": "(no plan tasks tagged — see Phase 2 in Day-90 review)"}],
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
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Wrote {out_path}  ({len(html):,} bytes)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = p.parse_args()
    main(args.out)
```

- [ ] **Step 2: Write the integration test**

Create `tests/scripts/quick_wins/test_build.py`:

```python
import json
from pathlib import Path

import pytest

from scripts.build_quick_wins import main


def test_build_produces_html_with_expected_content(tmp_path):
    out = tmp_path / "quick-wins.html"
    main(out_path=out)
    assert out.exists()
    html = out.read_text(encoding="utf-8")

    # Segment names present
    assert "Katana defectors" in html
    assert "Craftybase graduates" in html
    assert "candle" in html.lower()

    # KPIs / metric strings present
    assert "AU$" in html

    # Chart.js CDN
    assert "chart.js@4" in html.lower()

    # Payload script is valid JSON
    start = html.index('<script id="payload" type="application/json">') + len(
        '<script id="payload" type="application/json">'
    )
    end = html.index("</script>", start)
    payload = json.loads(html[start:end])
    assert "bar" in payload and "scatter" in payload and "gantt" in payload
    assert len(payload["bar"]["data"]) == 9
    assert len(payload["scatter"]) == 9
    assert set(payload["gantt"].keys()) == {"Build", "Sell", "Support", "Content"}
```

- [ ] **Step 3: Run the full test suite**

```bash
python -m pytest tests/scripts/quick_wins/ -v
```

Expected: every test passes.

- [ ] **Step 4: Build the actual HTML and inspect**

```bash
python scripts/build_quick_wins.py
ls -la docs/marketing/quick-wins.html
```

Expected: file exists, size 50–200 KB. Open it in Chrome (or `start docs/marketing/quick-wins.html` on Windows).

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quick_wins.py tests/scripts/quick_wins/test_build.py docs/marketing/quick-wins.html
git commit -m "feat(quick-wins): CLI entry point + integration test + first build"
```

---

## Task 12: Manual acceptance against spec §15

**Goal:** Walk through every acceptance criterion in the spec and tick them off. This is a manual smoke test in Chrome — there's no value in automating browser tests for a single-purpose static page.

**Files:** None (verification only).

**Acceptance Criteria** (mirror spec §15):
- [ ] AC1: Build script runs on Python 3.13 with no manual edits
- [ ] AC2: Page shows header nav, 4 KPI cards, bar chart, scatter chart, 9 cards, Gantt, week checklist, Day-90 checklist, 5 Charter tiles
- [ ] AC3: All 9 segments have non-empty ARPU/MRR/CAC/LTV/TTV/churn-risk/motion
- [ ] AC4: Each segment card's "This week" + "This month" lists have ≥1 item (placeholder where unmapped — verified visually)
- [ ] AC5: Ticking 3 checkboxes + reloading retains state
- [ ] AC6: Editing a Charter slot status + reloading retains the value
- [ ] AC7: Filter strip filters cards (charts left untouched — note this is a spec change from §10; capture below)
- [ ] AC8: URL hash reflects filter state on share
- [ ] AC9: Lighthouse a11y ≥90 (Chrome DevTools → Lighthouse → Accessibility only → mobile)
- [ ] AC10: Manuva colour `--brand-1` applied to priority-1 segment bars (DevTools → inspect `.segment` → `border-left-color` = `var(--priority-1)`)
- [ ] AC11: File size <300 KB (excluding the Chart.js CDN script)
- [ ] AC12: No "TBD" placeholder text in rendered HTML

**Verify:** Visual checks in Chrome.

**Steps:**

- [ ] **Step 1: Open the file in Chrome**

```bash
start docs/marketing/quick-wins.html  # Windows
# or: open docs/marketing/quick-wins.html  # macOS
```

- [ ] **Step 2: Walk every acceptance criterion above**

Take notes on any AC that fails. Common failure modes and their fixes:

- **Missing CAC/LTV on a card** — the segment view-model doesn't surface those; spec §7 lists them as "metric row" content but the template's `.metrics` grid is currently 4 cells (ARPU, MRR, TTV, fit). If the user wants all 7 metrics in the metric row, extend the grid in Task 9's template and re-add CAC/LTV/LTV-ratio/churn-risk in `_build_segment_view`.
- **Filter doesn't recompute KPI cards or charts** — spec §10 says filters DO recompute charts and KPIs. The current implementation only filters the segment cards (simpler scope). If full recomputation needed, extend `applyFilters` to re-call `chart.update()` with filtered data and update the KPI card numbers.
- **Lighthouse a11y < 90** — most likely cause: missing `<label>` on filter `<select>` or contrast on `--ink-muted`. Fix by adding visible labels and bumping contrast.

- [ ] **Step 3: Record any spec deltas**

If AC7 or AC10 was descoped or modified during implementation, add an "Implementation notes" section at the bottom of the spec file noting the decision.

- [ ] **Step 4: Commit any fixes from acceptance**

If criteria failed and you fixed them:

```bash
git add -p
git commit -m "fix(quick-wins): <specific acceptance criterion>"
```

- [ ] **Step 5: Final commit if any spec updates**

```bash
git add docs/superpowers/specs/2026-05-18-quick-wins-dashboard-design.md
git commit -m "docs(spec): record quick-wins acceptance deltas"
```

---

## Self-review

**Spec coverage:**
- §1 Purpose — Task 11 produces the file at the spec'd path. ✓
- §2 Inputs — Tasks 2 (JSON), 4 (plan), 11 (charter) cover all sources. ✓
- §3 Filter — Task 3. ✓
- §4 Layout — Task 9 template. ✓
- §5 KPI cards — Task 6 math + Task 9 markup. ✓
- §6 Charts — Task 7 datasets + Task 9 canvases + Task 10 init. ✓
- §7 Segment cards — Task 9 template + Task 11 view-model assembly. ✓
- §8 90-day plan section — Task 4 parser + Task 9 markup + Task 10 SVG Gantt. ✓
- §9 Charter — Task 9 template + Task 10 localStorage + Task 11 CHARTER_SLOTS. ✓
- §10 Filter strip — Task 10. ✓ (with explicit deferral of "filter recomputes charts" noted in Task 12)
- §11 Build script — Tasks 1-11 combined. ✓
- §12 Styling — Task 8 loader, Task 9 inlined tokens. ✓
- §13 State persistence — Task 10. ✓
- §14 Out of scope — n/a (no implementation needed) ✓
- §15 Acceptance criteria — Task 12. ✓
- §16 Future port — n/a ✓

**Placeholder scan:** None found. All code blocks contain runnable code.

**Type consistency:** `PlanTask` TypedDict introduced in Task 4 is used in Task 5 (mapping) and Task 11 (CLI assembly). `find_field` signature stable across all uses. `quick_wins: list[dict]` consistent.

---

## Execution handoff

Plan ready. Tasks file persisted alongside the plan. Recommended execution mode: subagent-driven for fast iteration with review between tasks.
