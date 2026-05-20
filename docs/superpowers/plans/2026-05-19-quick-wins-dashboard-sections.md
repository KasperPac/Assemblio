# Quick-Wins Dashboard — Sections 5-7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new sections to `docs/marketing/quick-wins.html` — Integrations Roadmap, Competitor Feature Gaps, and Client Pipeline — using the existing Python build pipeline and Jinja2 template.

**Architecture:** Two new hardcoded-data Python modules (`integrations.py`, `gaps.py`) feed the build script, which passes the data to the existing Jinja2 template. Three new `<section>` blocks are appended before `</main>`. Client-side JS handles gap status cycling and the Kanban board, both persisted to localStorage under `manuva:quick-wins:*` keys.

**Tech Stack:** Python 3.14, Jinja2 3.1, Chart.js 4.4.1 (already loaded), native HTML5 drag-and-drop, localStorage, pytest.

---

## File structure

**New files:**
- `scripts/quick_wins/integrations.py` — `INTEGRATIONS` list + `COMPETITOR_MATRIX` dict (hardcoded)
- `scripts/quick_wins/gaps.py` — `FEATURE_GAPS` list + `MANUVA_ADVANTAGES` list (hardcoded)
- `tests/scripts/quick_wins/test_integrations.py`
- `tests/scripts/quick_wins/test_gaps.py`

**Modified files:**
- `scripts/build_quick_wins.py` — import new modules, pass 4 new template context variables
- `scripts/quick_wins/templates/quick-wins.html.j2` — append sections 5-7 (HTML+CSS+JS)

---

### Task 1: `integrations.py` data module + tests

**Goal:** Hardcoded data module with `INTEGRATIONS` (10 entries) and `COMPETITOR_MATRIX` (dict keyed by integration name → competitor name → cell string).

**Files:**
- Create: `scripts/quick_wins/integrations.py`
- Create: `tests/scripts/quick_wins/test_integrations.py`

**Acceptance Criteria:**
- [ ] `len(INTEGRATIONS) == 10`
- [ ] Every entry has keys: `name`, `wave`, `status`, `data_flows`, `gotcha`
- [ ] `status` values are one of: `shipped`, `in_progress`, `planned`, `partner`
- [ ] `COMPETITOR_MATRIX` covers all 10 integration names and exactly 6 competitors per row
- [ ] All 6 tests pass

**Verify:** `python -m pytest tests/scripts/quick_wins/test_integrations.py -v` → 6 passed

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `tests/scripts/quick_wins/test_integrations.py`:

```python
from scripts.quick_wins.integrations import COMPETITOR_MATRIX, INTEGRATIONS

EXPECTED_COMPETITORS = {"Katana", "Cin7 Core", "MRPeasy", "Craftybase", "inFlow", "Manuva"}
VALID_STATUSES = {"shipped", "in_progress", "planned", "partner"}
VALID_CELLS = {"Native", "Via Extensiv", "Zapier only", "None",
               "Shipped", "Wave 1", "Wave 2", "Wave 3", "Partner"}


def test_integrations_has_ten_entries():
    assert len(INTEGRATIONS) == 10


def test_all_integrations_have_required_fields():
    required = {"name", "wave", "status", "data_flows", "gotcha"}
    for integ in INTEGRATIONS:
        missing = required - integ.keys()
        assert not missing, f"{integ.get('name')} missing: {missing}"


def test_integration_statuses_are_valid():
    for integ in INTEGRATIONS:
        assert integ["status"] in VALID_STATUSES, (
            f"{integ['name']} has invalid status '{integ['status']}'"
        )


def test_all_data_flows_are_non_empty_lists():
    for integ in INTEGRATIONS:
        assert isinstance(integ["data_flows"], list), f"{integ['name']} data_flows not a list"
        assert len(integ["data_flows"]) >= 1, f"{integ['name']} has no data flows"


def test_competitor_matrix_covers_all_integrations():
    integ_names = {i["name"] for i in INTEGRATIONS}
    assert set(COMPETITOR_MATRIX.keys()) == integ_names


def test_competitor_matrix_has_correct_competitors_per_row():
    for integ_name, competitors in COMPETITOR_MATRIX.items():
        assert set(competitors.keys()) == EXPECTED_COMPETITORS, (
            f"{integ_name} has wrong competitor keys"
        )
```

- [ ] **Step 2: Run tests — verify they fail**

```
python -m pytest tests/scripts/quick_wins/test_integrations.py -v
```
Expected: `ModuleNotFoundError` or 6 failures (module doesn't exist yet).

- [ ] **Step 3: Create `scripts/quick_wins/integrations.py`**

```python
"""Integrations roadmap data — waves, data flows, competitor matrix."""
from __future__ import annotations

INTEGRATIONS: list[dict] = [
    {
        "name": "Shopify",
        "wave": 0,
        "status": "shipped",
        "data_flows": [
            "Orders in (webhook, real-time)",
            "Stock push (finished goods)",
            "Fulfilment writeback + tracking",
            "Returns: not yet synced",
        ],
        "gotcha": "Shopify returns are NOT synced — must be handled manually.",
    },
    {
        "name": "Xero",
        "wave": 1,
        "status": "in_progress",
        "data_flows": [
            "Sales invoices (AR)",
            "Purchase bills (AP)",
            "Per-production-order COGS journal",
            "WIP roll-forward journal",
            "Variance lines (PPV, MUV, scrap)",
        ],
        "gotcha": "Tracking categories hard-capped at 2 active; granular OAuth scopes mandatory from March 2026.",
    },
    {
        "name": "WooCommerce",
        "wave": 2,
        "status": "planned",
        "data_flows": [
            "Orders in (webhook)",
            "Stock push",
            "Fulfilment writeback",
        ],
        "gotcha": "Auth is per-store key pair (not OAuth); FastCGI hosts may strip Authorization header.",
    },
    {
        "name": "Amazon AU",
        "wave": 2,
        "status": "planned",
        "data_flows": [
            "Orders in (polling + ORDER_CHANGE notifications)",
            "FBA inventory reconciliation",
            "FBM fulfilment writeback",
        ],
        "gotcha": "Amazon AU is a separate seller account from US/EU; marketplace ID A39IBJ37TRP1C6 (Far East cluster).",
    },
    {
        "name": "QuickBooks Online",
        "wave": 2,
        "status": "planned",
        "data_flows": [
            "Sales invoices (AR)",
            "Purchase bills (AP)",
            "COGS journal (Xero parity)",
        ],
        "gotcha": "Negligible AU market share — priority secondary to Xero; relevant for US expansion.",
    },
    {
        "name": "MyOB AccountRight",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Purchase bills (AP)",
            "Sales invoices (AR)",
            "COGS journal",
            "Inventory Adjustment for build events",
        ],
        "gotcha": "Requires x-myobapi-cftoken header alongside OAuth; no hosted sandbox with seeded data.",
    },
    {
        "name": "Etsy",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Orders in (polling — no webhooks available)",
            "Stock push",
            "Listing sync",
        ],
        "gotcha": "Rate limit: 10k QPD shared across ALL shops — scaling risk at multi-tenant volumes.",
    },
    {
        "name": "eBay AU",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Orders in",
            "Stock push",
            "Fulfilment writeback with tracking number",
        ],
        "gotcha": "Must set marketplaceId: EBAY_AU on every offer — wrong value lists on .com not .com.au.",
    },
    {
        "name": "Starshipit",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Outbound order handoff (ready-to-ship orders)",
            "Tracking number writeback to source channel",
        ],
        "gotcha": "AU-native carrier roster (AusPost, StarTrack, Aramex, Sendle); follow existing Katana/Cin7 connector pattern.",
    },
    {
        "name": "A2X",
        "wave": None,
        "status": "partner",
        "data_flows": [
            "Payout reconciliation (revenue side)",
            "Channel fees, refunds, GST → Xero/MyOB",
        ],
        "gotcha": "Not built by Manuva — partner recommendation. A2X handles revenue journals; Manuva handles COGS. Accounts don't overlap.",
    },
]

# Maps integration name → competitor name → cell display value.
COMPETITOR_MATRIX: dict[str, dict[str, str]] = {
    "Shopify":            {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "Native",  "Manuva": "Shipped"},
    "Xero":               {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 1"},
    "WooCommerce":        {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "Native",  "Manuva": "Wave 2"},
    "Amazon AU":          {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "Native",  "Manuva": "Wave 2"},
    "QuickBooks Online":  {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "None",    "Manuva": "Wave 2"},
    "MyOB AccountRight":  {"Katana": "None",         "Cin7 Core": "None",    "MRPeasy": "None",         "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 3"},
    "Etsy":               {"Katana": "Via Extensiv", "Cin7 Core": "Native",  "MRPeasy": "Zapier only",  "Craftybase": "Native",       "inFlow": "None",    "Manuva": "Wave 3"},
    "eBay AU":            {"Katana": "Via Extensiv", "Cin7 Core": "Native",  "MRPeasy": "Zapier only",  "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 3"},
    "Starshipit":         {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "None",         "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 3"},
    "A2X":                {"Katana": "None",         "Cin7 Core": "None",    "MRPeasy": "None",         "Craftybase": "None",         "inFlow": "None",    "Manuva": "Partner"},
}
```

- [ ] **Step 4: Run tests — verify they pass**

```
python -m pytest tests/scripts/quick_wins/test_integrations.py -v
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/quick_wins/integrations.py tests/scripts/quick_wins/test_integrations.py
git commit -m "feat(quick-wins): integrations data module + tests"
```

---

### Task 2: `gaps.py` data module + tests

**Goal:** Hardcoded data module with `FEATURE_GAPS` (13 entries) and `MANUVA_ADVANTAGES` (4 entries).

**Files:**
- Create: `scripts/quick_wins/gaps.py`
- Create: `tests/scripts/quick_wins/test_gaps.py`

**Acceptance Criteria:**
- [ ] `len(FEATURE_GAPS) == 13`
- [ ] Severity counts: Critical×2, High×3, Medium×5, Low×3
- [ ] All severity values in `{"critical","high","medium","low"}`
- [ ] `len(MANUVA_ADVANTAGES) == 4`
- [ ] All 7 tests pass

**Verify:** `python -m pytest tests/scripts/quick_wins/test_gaps.py -v` → 7 passed

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `tests/scripts/quick_wins/test_gaps.py`:

```python
from collections import Counter

from scripts.quick_wins.gaps import FEATURE_GAPS, MANUVA_ADVANTAGES

VALID_SEVERITIES = {"critical", "high", "medium", "low"}
VALID_STATUSES = {"backlog", "planned", "in_progress", "done"}


def test_feature_gaps_has_thirteen_entries():
    assert len(FEATURE_GAPS) == 13


def test_all_gaps_have_required_fields():
    required = {"name", "severity", "competitor_count", "default_status"}
    for gap in FEATURE_GAPS:
        missing = required - gap.keys()
        assert not missing, f"Gap '{gap.get('name')}' missing: {missing}"


def test_severity_values_are_valid():
    for gap in FEATURE_GAPS:
        assert gap["severity"] in VALID_SEVERITIES, (
            f"'{gap['name']}' has invalid severity '{gap['severity']}'"
        )


def test_severity_distribution():
    counts = Counter(g["severity"] for g in FEATURE_GAPS)
    assert counts["critical"] == 2
    assert counts["high"] == 3
    assert counts["medium"] == 5
    assert counts["low"] == 3


def test_competitor_count_in_valid_range():
    for gap in FEATURE_GAPS:
        assert 0 <= gap["competitor_count"] <= 7, (
            f"'{gap['name']}' competitor_count out of range"
        )


def test_manuva_advantages_has_four_entries():
    assert len(MANUVA_ADVANTAGES) == 4


def test_manuva_advantages_are_non_empty_strings():
    for adv in MANUVA_ADVANTAGES:
        assert isinstance(adv, str) and len(adv) > 0
```

- [ ] **Step 2: Run tests — verify they fail**

```
python -m pytest tests/scripts/quick_wins/test_gaps.py -v
```
Expected: `ModuleNotFoundError` or 7 failures.

- [ ] **Step 3: Create `scripts/quick_wins/gaps.py`**

```python
"""Competitor feature gap data for the quick-wins dashboard."""
from __future__ import annotations

# Ordered by severity desc then competitor_count desc — matches table render order.
FEATURE_GAPS: list[dict] = [
    {"name": "Accounting integration (Xero / QuickBooks)", "severity": "critical", "competitor_count": 6, "default_status": "in_progress"},
    {"name": "Lot / batch / serial tracking",              "severity": "critical", "competitor_count": 5, "default_status": "backlog"},
    {"name": "Multi-channel ecommerce (WooCommerce, Amazon)", "severity": "high",  "competitor_count": 6, "default_status": "planned"},
    {"name": "Reorder points / auto-PO",                   "severity": "high",     "competitor_count": 5, "default_status": "backlog"},
    {"name": "Export PDF / CSV on Growth tier",            "severity": "high",     "competitor_count": 7, "default_status": "backlog"},
    {"name": "Multi-currency",                             "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "Visual production scheduler",                "severity": "medium",   "competitor_count": 3, "default_status": "backlog"},
    {"name": "Barcode scanning",                           "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "Mobile app",                                 "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "Batch production tracking",                  "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "B2B / wholesale portal",                     "severity": "low",      "competitor_count": 2, "default_status": "backlog"},
    {"name": "Subcontracting",                             "severity": "low",      "competitor_count": 1, "default_status": "backlog"},
    {"name": "CRM / customer management",                  "severity": "low",      "competitor_count": 1, "default_status": "backlog"},
]

MANUVA_ADVANTAGES: list[str] = [
    "Yield % per BOM line — unique at this price range (Katana has none at any price)",
    "BOM versioning + templates — exclusive at $249/mo",
    "Unlimited users flat pricing — Katana hits $807/mo with equivalent add-ons",
    "Capacity planning + staff costing at Pro — no direct competitor at $499/mo flat",
]
```

- [ ] **Step 4: Run tests — verify they pass**

```
python -m pytest tests/scripts/quick_wins/test_gaps.py -v
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/quick_wins/gaps.py tests/scripts/quick_wins/test_gaps.py
git commit -m "feat(quick-wins): gaps data module + tests"
```

---

### Task 3: Build script wiring + integration test

**Goal:** Import the two new modules in `build_quick_wins.py` and pass `integrations`, `competitor_matrix`, `feature_gaps`, `manuva_advantages` to the template context. Extend the existing integration test to verify the build still succeeds.

**Files:**
- Modify: `scripts/build_quick_wins.py`
- Modify: `tests/scripts/quick_wins/test_build.py`

**Acceptance Criteria:**
- [ ] `python scripts/build_quick_wins.py` runs without error
- [ ] Integration test passes with all 46 + 1 = 47 tests

**Verify:** `python -m pytest tests/scripts/quick_wins/test_build.py -v` → all passed

**Steps:**

- [ ] **Step 1: Add the failing integration test**

In `tests/scripts/quick_wins/test_build.py`, append after the existing test function:

```python
def test_build_passes_new_context_variables(tmp_path):
    """Verify build succeeds after new context variables are wired."""
    out = tmp_path / "quick-wins.html"
    main(out_path=out)
    assert out.exists()
    html = out.read_text(encoding="utf-8")
    # Existing content still intact
    assert "Katana defectors" in html
    assert len(html) > 50_000
```

- [ ] **Step 2: Run — verify it currently passes (pre-wiring)**

```
python -m pytest tests/scripts/quick_wins/test_build.py -v
```
This should still pass at this point (the test doesn't check for new sections yet).

- [ ] **Step 3: Wire new imports into `build_quick_wins.py`**

Add these two import lines after the existing `from scripts.quick_wins.style_loader import load_tokens` line:

```python
from scripts.quick_wins.integrations import COMPETITOR_MATRIX, INTEGRATIONS  # noqa: E402
from scripts.quick_wins.gaps import FEATURE_GAPS, MANUVA_ADVANTAGES  # noqa: E402
```

- [ ] **Step 4: Pass new variables to template context**

In the `tpl.render(...)` call inside `main()`, add four new keyword arguments after `charter_slots=CHARTER_SLOTS`:

```python
        integrations=INTEGRATIONS,
        competitor_matrix=COMPETITOR_MATRIX,
        feature_gaps=FEATURE_GAPS,
        manuva_advantages=MANUVA_ADVANTAGES,
```

The full `tpl.render(...)` call should now look like:

```python
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
```

- [ ] **Step 5: Run all tests**

```
python -m pytest tests/scripts/quick_wins/ -v
```
Expected: all 47 tests pass (46 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add scripts/build_quick_wins.py tests/scripts/quick_wins/test_build.py
git commit -m "feat(quick-wins): wire integrations+gaps context to build script"
```

---

### Task 4: Template — Section 5 Integrations Roadmap

**Goal:** Add Section 5 HTML, CSS, and nav link to `quick-wins.html.j2`. No JS needed (matrix uses native `<details>`). Rebuild confirms section renders correctly.

**Files:**
- Modify: `scripts/quick_wins/templates/quick-wins.html.j2`

**Acceptance Criteria:**
- [ ] "Integrations Roadmap" heading appears in built HTML
- [ ] All 10 integration names appear in built HTML
- [ ] "Wave 0" through "Wave 3" labels appear
- [ ] Competitor matrix table is present and includes "Via Extensiv"
- [ ] All 47 tests still pass

**Verify:** `python -m pytest tests/scripts/quick_wins/ -v && python scripts/build_quick_wins.py` → all pass + HTML written

**Steps:**

- [ ] **Step 1: Add CSS before `</style>` at line 78**

Find the line `  </style>` (line 78) and insert this block immediately before it:

```css

    /* ── Section 5: Integrations ─────────────────────────────────────────── */
    .wave-tracker { display: flex; margin: 16px 0 24px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-subtle); }
    .wave { flex: 1; padding: 10px 14px; background: var(--bg-card); border-right: 1px solid var(--border-subtle); }
    .wave:last-child { border-right: none; }
    .wave-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); }
    .wave-items { font-size: 13px; color: var(--ink-strong); margin-top: 4px; }
    .wave.wave-shipped { background: var(--bg-canvas, #F5F7FB); }
    .wave.wave-progress { background: rgba(14,91,255,0.06); }

    .integrations-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .integ-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 14px; }
    .integ-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .integ-name { font-weight: 600; font-size: 14px; color: var(--ink-strong); }
    .wave-badge { font-size: 10px; padding: 2px 6px; border-radius: 10px; background: var(--border-subtle); color: var(--ink-muted); font-weight: 600; }
    .status-pill { font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; text-transform: capitalize; }
    .status-pill.shipped { background: rgba(26,165,99,0.12); color: #1AA563; }
    .status-pill.in_progress { background: rgba(240,169,30,0.15); color: #C47D00; }
    .status-pill.planned { background: rgba(14,91,255,0.1); color: var(--brand-1, #0E5BFF); }
    .status-pill.partner { background: rgba(0,0,0,0.06); color: var(--ink-muted); }
    .integ-card .data-flows { margin: 0 0 8px; padding-left: 16px; font-size: 12px; color: var(--ink-base, #2C3444); line-height: 1.6; }
    .integ-card .gotcha { font-size: 11px; color: var(--ink-muted); border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 8px; }

    .matrix-details summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--brand-1, #0E5BFF); padding: 8px 0; user-select: none; }
    .matrix-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
    .matrix-table th { background: var(--bg-canvas, #F5F7FB); padding: 6px 10px; text-align: left; font-weight: 600; color: var(--ink-muted); border-bottom: 2px solid var(--border-subtle); }
    .matrix-table td { padding: 6px 10px; border-bottom: 1px solid var(--border-subtle); color: var(--ink-strong); }
    .matrix-table tr:last-child td { border-bottom: none; }
    .cell-native, .cell-shipped { color: #1AA563; font-weight: 600; }
    .cell-wave-1, .cell-wave-2, .cell-wave-3 { color: var(--brand-1, #0E5BFF); }
    .cell-partner { color: var(--ink-muted); font-style: italic; }
    .cell-via-extensiv, .cell-zapier-only { color: #C47D00; }
    .cell-none { color: var(--border-subtle); }
```

- [ ] **Step 2: Add nav links**

Find `<a href="#charter">Charter</a>` (line ~91) and replace it with:

```html
    <a href="#charter">Charter</a>
    <a href="#integrations">Integrations</a>
    <a href="#gaps">Gaps</a>
    <a href="#pipeline">Pipeline</a>
```

- [ ] **Step 3: Add Section 5 HTML before `</main>`**

Find `</main>` (the line after the charter section, line ~243) and insert this block immediately before it:

```html
<section id="integrations">
  <h2>Integrations Roadmap</h2>
  <p class="note">10 targets across 4 waves. Data flows show what syncs in each direction. Matrix is collapsible.</p>

  <div class="wave-tracker">
    <div class="wave wave-shipped">
      <div class="wave-label">Wave 0 · Shipped</div>
      <div class="wave-items">Shopify</div>
    </div>
    <div class="wave wave-progress">
      <div class="wave-label">Wave 1 · In Progress</div>
      <div class="wave-items">Xero</div>
    </div>
    <div class="wave">
      <div class="wave-label">Wave 2 · Planned</div>
      <div class="wave-items">WooCommerce · Amazon AU · QuickBooks Online</div>
    </div>
    <div class="wave">
      <div class="wave-label">Wave 3 · Planned</div>
      <div class="wave-items">MyOB · Etsy · eBay AU · Starshipit</div>
    </div>
  </div>

  <div class="integrations-grid">
    {% for integ in integrations %}
    <div class="integ-card">
      <div class="integ-header">
        <span class="integ-name">{{ integ.name }}</span>
        {% if integ.wave is not none %}<span class="wave-badge">Wave {{ integ.wave }}</span>{% endif %}
        <span class="status-pill {{ integ.status }}">{{ integ.status | replace('_', ' ') }}</span>
      </div>
      <ul class="data-flows">
        {% for flow in integ.data_flows %}<li>{{ flow }}</li>{% endfor %}
      </ul>
      <div class="gotcha">⚠ {{ integ.gotcha }}</div>
    </div>
    {% endfor %}
  </div>

  <details class="matrix-details">
    <summary>Competitor × Integration matrix</summary>
    <table class="matrix-table">
      <thead>
        <tr>
          <th>Integration</th>
          {% for comp in ["Katana", "Cin7 Core", "MRPeasy", "Craftybase", "inFlow", "Manuva"] %}<th>{{ comp }}</th>{% endfor %}
        </tr>
      </thead>
      <tbody>
        {% for integ in integrations %}
        <tr>
          <td>{{ integ.name }}</td>
          {% for comp in ["Katana", "Cin7 Core", "MRPeasy", "Craftybase", "inFlow", "Manuva"] %}
          {% set cell = competitor_matrix[integ.name][comp] %}
          <td class="cell-{{ cell | lower | replace(' ', '-') }}">{{ cell }}</td>
          {% endfor %}
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </details>
</section>

```

- [ ] **Step 4: Build and verify**

```
python scripts/build_quick_wins.py
```
Then open `docs/marketing/quick-wins.html` and confirm the Integrations section renders with cards and the matrix.

- [ ] **Step 5: Run all tests**

```
python -m pytest tests/scripts/quick_wins/ -v
```
Expected: all 47 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/quick_wins/templates/quick-wins.html.j2
git commit -m "feat(quick-wins): Section 5 Integrations Roadmap"
```

---

### Task 5: Template — Section 6 Competitor Feature Gaps

**Goal:** Add Section 6 with severity summary bar, gap table with clickable status-cycling buttons, Manuva advantages panel, and the localStorage JS to persist gap statuses.

**Files:**
- Modify: `scripts/quick_wins/templates/quick-wins.html.j2`

**Acceptance Criteria:**
- [ ] "Competitor Feature Gaps" heading in built HTML
- [ ] All 13 gap names present in built HTML
- [ ] Severity badges present: "critical", "high", "medium", "low"
- [ ] "Where Manuva wins today" panel present
- [ ] All 47 tests still pass

**Verify:** `python -m pytest tests/scripts/quick_wins/ -v && python scripts/build_quick_wins.py`

**Steps:**

- [ ] **Step 1: Add CSS before `</style>`**

Find `  </style>` and insert immediately before it:

```css

    /* ── Section 6: Competitor Gaps ─────────────────────────────────────── */
    .gap-summary { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
    .sev-pill { font-size: 13px; font-weight: 600; }
    .gap-progress { font-size: 12px; color: var(--ink-muted); }

    .gaps-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    .gaps-table th { background: var(--bg-canvas, #F5F7FB); padding: 8px 12px; text-align: left; font-weight: 600; color: var(--ink-muted); border-bottom: 2px solid var(--border-subtle); }
    .gaps-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); color: var(--ink-strong); }
    .gaps-table tr:last-child td { border-bottom: none; }

    .sev-badge { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 10px; text-transform: capitalize; }
    .sev-badge.critical { background: rgba(220,38,38,0.1); color: #DC2626; }
    .sev-badge.high { background: rgba(240,169,30,0.15); color: #C47D00; }
    .sev-badge.medium { background: rgba(14,91,255,0.1); color: var(--brand-1, #0E5BFF); }
    .sev-badge.low { background: rgba(0,0,0,0.06); color: var(--ink-muted); }

    .status-cycle { font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; text-transform: capitalize; }
    .status-cycle[data-status="done"] { background: rgba(26,165,99,0.12); border-color: #1AA563; color: #1AA563; font-weight: 600; }
    .status-cycle[data-status="in_progress"] { background: rgba(240,169,30,0.15); border-color: #C47D00; color: #C47D00; }
    .status-cycle[data-status="planned"] { background: rgba(14,91,255,0.1); border-color: var(--brand-1,#0E5BFF); color: var(--brand-1,#0E5BFF); }

    .advantages-panel { background: var(--bg-card); border: 1px solid var(--border-subtle); border-left: 4px solid var(--brand-1, #0E5BFF); border-radius: 8px; padding: 16px 20px; }
    .advantages-panel h3 { margin: 0 0 10px; font-size: 14px; color: var(--ink-strong); }
    .advantages-panel ul { margin: 0; padding-left: 18px; }
    .advantages-panel li { font-size: 13px; color: var(--ink-base, #2C3444); line-height: 1.7; }
```

- [ ] **Step 2: Add Section 6 HTML before `</main>`**

Find `</main>` and insert immediately before it (after the integrations section added in Task 4):

```html
<section id="gaps">
  <h2>Competitor Feature Gaps</h2>
  <p class="note">13 gaps ranked by sales impact. Click Status to cycle: backlog → planned → in progress → done.</p>

  <div class="gap-summary">
    <span class="sev-pill">🔴 2 Critical</span>
    <span class="sev-pill">🟡 3 High</span>
    <span class="sev-pill">🟠 5 Medium</span>
    <span class="sev-pill">🟢 3 Low</span>
    <span class="gap-progress" id="gap-progress-count"></span>
  </div>

  <table class="gaps-table">
    <thead>
      <tr><th>Gap</th><th>Severity</th><th>Competitors with it</th><th>Status</th></tr>
    </thead>
    <tbody>
      {% for gap in feature_gaps %}
      <tr>
        <td>{{ gap.name }}</td>
        <td><span class="sev-badge {{ gap.severity }}">{{ gap.severity }}</span></td>
        <td>{{ gap.competitor_count }}/7</td>
        <td>
          <button class="status-cycle"
                  data-gap-idx="{{ loop.index0 }}"
                  data-default="{{ gap.default_status }}"
                  data-status="{{ gap.default_status }}">
            {{ gap.default_status | replace('_', ' ') }}
          </button>
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="advantages-panel">
    <h3>Where Manuva wins today</h3>
    <ul>
      {% for adv in manuva_advantages %}<li>{{ adv }}</li>{% endfor %}
    </ul>
  </div>
</section>

```

- [ ] **Step 3: Add JS before `})();`**

Find `})();` (the last line of the `<script>` block) and insert immediately before it:

```javascript
  // ── Gap status cycling (Section 6) ────────────────────────────────────────
  const LS_GAPS = 'manuva:quick-wins:gaps';
  const GAP_STATUSES = ['backlog', 'planned', 'in_progress', 'done'];
  const gapState = JSON.parse(localStorage.getItem(LS_GAPS) || '{}');

  function updateGapProgress() {
    const total = document.querySelectorAll('.status-cycle').length;
    const done  = document.querySelectorAll('.status-cycle[data-status="done"]').length;
    const prog  = document.querySelectorAll('.status-cycle[data-status="in_progress"]').length;
    const el = document.getElementById('gap-progress-count');
    if (el) el.textContent = `${done} done · ${prog} in progress / ${total} total`;
  }

  document.querySelectorAll('.status-cycle').forEach(btn => {
    const idx = btn.dataset.gapIdx;
    const saved = gapState[idx];
    if (saved) {
      btn.dataset.status = saved;
      btn.textContent = saved.replace('_', ' ');
    }
    btn.addEventListener('click', () => {
      const cur  = GAP_STATUSES.indexOf(btn.dataset.status);
      const next = GAP_STATUSES[(cur + 1) % GAP_STATUSES.length];
      btn.dataset.status = next;
      btn.textContent    = next.replace('_', ' ');
      gapState[idx] = next;
      localStorage.setItem(LS_GAPS, JSON.stringify(gapState));
      updateGapProgress();
    });
  });
  updateGapProgress();

```

- [ ] **Step 4: Build and verify**

```
python scripts/build_quick_wins.py
```
Open `docs/marketing/quick-wins.html`, confirm the Gaps section renders and clicking a Status button changes its text.

- [ ] **Step 5: Run all tests**

```
python -m pytest tests/scripts/quick_wins/ -v
```
Expected: all 47 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/quick_wins/templates/quick-wins.html.j2
git commit -m "feat(quick-wins): Section 6 Competitor Feature Gaps"
```

---

### Task 6: Template — Section 7 Client Pipeline

**Goal:** Add Section 7 with Kanban board (5 columns, drag-and-drop, localStorage), funnel MRR summary, and static acquisition channels reference table.

**Files:**
- Modify: `scripts/quick_wins/templates/quick-wins.html.j2`

**Acceptance Criteria:**
- [ ] "Client Pipeline" heading in built HTML
- [ ] Five Kanban column headers: Prospect, Discovery Call, Trial, Negotiation, Closed Won
- [ ] "Acquisition Channels by Segment" heading present
- [ ] All 9 segment rows in channels table
- [ ] All 47 tests still pass

**Verify:** `python -m pytest tests/scripts/quick_wins/ -v && python scripts/build_quick_wins.py`

**Steps:**

- [ ] **Step 1: Add CSS before `</style>`**

Find `  </style>` and insert immediately before it:

```css

    /* ── Section 7: Client Pipeline ─────────────────────────────────────── */
    .funnel-summary { font-size: 13px; color: var(--ink-muted); margin-bottom: 16px; min-height: 20px; }
    .funnel-summary strong { color: var(--ink-strong); }

    .kanban { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 32px; }
    .kanban-col { flex: 0 0 190px; background: var(--bg-canvas, #F5F7FB); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 160px; }
    .kanban-col.drag-over { outline: 2px dashed var(--brand-1, #0E5BFF); }
    .col-header { font-size: 11px; font-weight: 700; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.06em; padding: 2px; }
    .cards-container { flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 40px; }
    .pipeline-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 10px 10px 10px; font-size: 12px; cursor: grab; position: relative; }
    .pipeline-card:active { cursor: grabbing; opacity: 0.7; }
    .pipeline-card .card-name { font-weight: 600; color: var(--ink-strong); margin-bottom: 4px; outline: none; border: none; background: none; width: 100%; font-size: 12px; padding: 0; }
    .pipeline-card .card-seg { font-size: 11px; color: var(--brand-1, #0E5BFF); margin: 4px 0; display: block; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 2px 4px; background: var(--bg-card); width: 100%; }
    .pipeline-card .card-mrr { font-size: 11px; color: var(--ink-muted); margin-top: 4px; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 2px 4px; width: 100%; background: var(--bg-card); }
    .pipeline-card .card-delete { position: absolute; top: 6px; right: 6px; border: none; background: none; cursor: pointer; color: var(--ink-muted); font-size: 14px; line-height: 1; padding: 0 2px; }
    .pipeline-card .card-delete:hover { color: #DC2626; }
    .add-card-btn { font-size: 12px; color: var(--ink-muted); background: none; border: 1px dashed var(--border-subtle); border-radius: 6px; padding: 6px; cursor: pointer; text-align: center; width: 100%; }
    .add-card-btn:hover { background: var(--bg-card); color: var(--brand-1, #0E5BFF); }

    .channels-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    .channels-table th { background: var(--bg-canvas, #F5F7FB); padding: 8px 12px; text-align: left; font-weight: 600; color: var(--ink-muted); border-bottom: 2px solid var(--border-subtle); }
    .channels-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); color: var(--ink-strong); vertical-align: top; }
    .channels-table tr:last-child td { border-bottom: none; }
```

- [ ] **Step 2: Add Section 7 HTML before `</main>`**

Find `</main>` and insert immediately before it (after the gaps section added in Task 5):

```html
<section id="pipeline">
  <h2>Client Pipeline</h2>
  <p class="note">Drag cards between columns. State persists in localStorage. Charter slots above are separate.</p>

  <div class="funnel-summary" id="funnel-summary"></div>

  <div class="kanban" id="kanban-board">
    {% for col_name in ["Prospect", "Discovery Call", "Trial", "Negotiation", "Closed Won"] %}
    <div class="kanban-col" data-col="{{ loop.index0 }}">
      <div class="col-header">{{ col_name }}</div>
      <div class="cards-container" id="col-{{ loop.index0 }}"></div>
      <button class="add-card-btn" data-col="{{ loop.index0 }}">+ Add</button>
    </div>
    {% endfor %}
  </div>

  <h3 style="font-size:15px;margin:0 0 8px;color:var(--ink-strong)">Acquisition Channels by Segment</h3>
  <table class="channels-table">
    <thead>
      <tr><th>Segment</th><th>Primary channel</th><th>Secondary channel</th><th>Where to find them</th></tr>
    </thead>
    <tbody>
      <tr><td>Cosmetics / Skincare</td><td>Instagram DM (beauty founders)</td><td>Beauty Expo AU</td><td>#indiebeauty, AU beauty founder Facebook groups</td></tr>
      <tr><td>Candle / Soap makers</td><td>Facebook groups</td><td>Etsy seller communities</td><td>"Candle making AU" FB groups, Faire wholesale</td></tr>
      <tr><td>Coffee Roasters</td><td>Direct outreach</td><td>Specialty coffee events</td><td>ASCA events, AU specialty roaster directories</td></tr>
      <tr><td>Small-batch Food / Bev</td><td>Industry associations</td><td>State food expos</td><td>AFCA, Fine Food Australia</td></tr>
      <tr><td>Apparel / Accessories</td><td>Shopify App Store reviews</td><td>Fashion trade shows</td><td>AGHA Gift Fair, rag trade FB groups</td></tr>
      <tr><td>Supplements / Nutraceuticals</td><td>LinkedIn (founders)</td><td>TGA compliance forums</td><td>Supplement industry associations</td></tr>
      <tr><td>Pet Food / Treats</td><td>Facebook groups</td><td>Petbarn supplier pathway</td><td>AU pet industry trade shows</td></tr>
      <tr><td>Craft Beer / Spirits</td><td>Brewing associations</td><td>BrewCon AU</td><td>IBD AU chapter, independent bottle shops</td></tr>
      <tr><td>Home Goods / Furniture</td><td>Trade shows</td><td>Interior design communities</td><td>AGHA, Decor + Design Melbourne</td></tr>
    </tbody>
  </table>
</section>

```

- [ ] **Step 3: Add JS before `})();`**

Find `})();` and insert immediately before it:

```javascript
  // ── Pipeline Kanban (Section 7) ────────────────────────────────────────────
  const LS_PIPELINE = 'manuva:quick-wins:pipeline';
  const PIPELINE_SEGS = ['Cosmetics','Candle/Soap','Coffee Roasters','Food/Bev','Apparel','Supplements','Pet Food','Craft Beer','Home Goods'];
  const PIPELINE_COL_NAMES = ['Prospect','Discovery Call','Trial','Negotiation','Closed Won'];
  let pipelineCards = JSON.parse(localStorage.getItem(LS_PIPELINE) || '[]');
  let dragCardId = null;

  function savePipeline() {
    localStorage.setItem(LS_PIPELINE, JSON.stringify(pipelineCards));
  }

  function updateFunnelSummary() {
    const counts = [0, 0, 0, 0, 0];
    let mrrTotal = 0;
    pipelineCards.forEach(c => {
      if (c.col >= 0 && c.col <= 4) counts[c.col]++;
      if (c.mrr) mrrTotal += Number(c.mrr) || 0;
    });
    const el = document.getElementById('funnel-summary');
    if (!el) return;
    el.innerHTML = PIPELINE_COL_NAMES.map((n, i) => `<strong>${counts[i]}</strong> ${n}`).join(' · ') +
      (mrrTotal > 0 ? ` · <strong>AU$${mrrTotal.toLocaleString()}</strong> pipeline MRR` : '');
  }

  function renderCard(card) {
    const container = document.getElementById(`col-${card.col}`);
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'pipeline-card';
    div.draggable = true;
    div.dataset.cardId = card.id;
    const segOptions = PIPELINE_SEGS.map(s => `<option${s === card.seg ? ' selected' : ''}>${s}</option>`).join('');
    div.innerHTML = `
      <input class="card-name" type="text" value="${(card.name || '').replace(/"/g, '&quot;')}" placeholder="Company name">
      <select class="card-seg">${segOptions}</select>
      <input class="card-mrr" type="number" placeholder="Est. MRR (AU$)" value="${card.mrr || ''}" min="0">
      <button class="card-delete" title="Remove">×</button>`;
    div.querySelector('.card-name').addEventListener('change', e => {
      card.name = e.target.value.trim() || 'New prospect';
      savePipeline();
    });
    div.querySelector('.card-seg').addEventListener('change', e => {
      card.seg = e.target.value; savePipeline();
    });
    div.querySelector('.card-mrr').addEventListener('change', e => {
      card.mrr = e.target.value; savePipeline(); updateFunnelSummary();
    });
    div.querySelector('.card-delete').addEventListener('click', () => {
      pipelineCards = pipelineCards.filter(c => c.id !== card.id);
      savePipeline();
      div.remove();
      updateFunnelSummary();
    });
    div.addEventListener('dragstart', e => {
      dragCardId = card.id;
      e.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', () => {
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
    });
    container.appendChild(div);
  }

  function renderPipeline() {
    document.querySelectorAll('.cards-container').forEach(c => { c.innerHTML = ''; });
    pipelineCards.forEach(card => renderCard(card));
    updateFunnelSummary();
  }

  function pipelineAddCard(colIdx) {
    const card = { id: Date.now(), name: 'New prospect', seg: PIPELINE_SEGS[0], mrr: '', col: colIdx };
    pipelineCards.push(card);
    savePipeline();
    renderCard(card);
    updateFunnelSummary();
  }

  // Wire column drop targets and add buttons via addEventListener (not inline handlers,
  // since inline handlers can't reach functions defined inside this IIFE).
  document.querySelectorAll('#kanban-board .cards-container').forEach(container => {
    const colIdx = parseInt(container.closest('.kanban-col').dataset.col);
    container.addEventListener('dragover', e => {
      e.preventDefault();
      container.closest('.kanban-col').classList.add('drag-over');
    });
    container.addEventListener('dragleave', () => {
      container.closest('.kanban-col').classList.remove('drag-over');
    });
    container.addEventListener('drop', e => {
      e.preventDefault();
      container.closest('.kanban-col').classList.remove('drag-over');
      if (dragCardId === null) return;
      const card = pipelineCards.find(c => c.id === dragCardId);
      if (card) { card.col = colIdx; savePipeline(); renderPipeline(); }
      dragCardId = null;
    });
  });

  document.querySelectorAll('#kanban-board .add-card-btn').forEach(btn => {
    btn.addEventListener('click', () => pipelineAddCard(parseInt(btn.dataset.col)));
  });

  renderPipeline();

```

- [ ] **Step 4: Also update the export-state JS to include gaps and pipeline**

Find the existing export-state handler (the block starting `document.getElementById('export-state').addEventListener`) and replace it with:

```javascript
  document.getElementById('export-state').addEventListener('click', () => {
    const data = JSON.stringify({
      tasks:    JSON.parse(localStorage.getItem(LS_TASKS)    || '{}'),
      charter:  JSON.parse(localStorage.getItem(LS_CHARTER)  || '{}'),
      gaps:     JSON.parse(localStorage.getItem(LS_GAPS)     || '{}'),
      pipeline: JSON.parse(localStorage.getItem(LS_PIPELINE) || '[]'),
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'manuva-quick-wins-state.json',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });
```

- [ ] **Step 5: Also update the reset-all JS to clear new keys**

Find the existing reset-all handler and replace it with:

```javascript
  document.getElementById('reset-all').addEventListener('click', () => {
    if (confirm('Reset all ticks, Charter slot status, gap statuses, and pipeline cards?')) {
      localStorage.removeItem(LS_TASKS);
      localStorage.removeItem(LS_CHARTER);
      localStorage.removeItem(LS_GAPS);
      localStorage.removeItem(LS_PIPELINE);
      location.reload();
    }
  });
```

- [ ] **Step 6: Build and verify**

```
python scripts/build_quick_wins.py
```
Open `docs/marketing/quick-wins.html`, confirm the Pipeline section renders with 5 columns, clicking "+ Add" creates a card, and dragging works between columns.

- [ ] **Step 7: Run all tests**

```
python -m pytest tests/scripts/quick_wins/ -v
```
Expected: all 47 tests pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/quick_wins/templates/quick-wins.html.j2
git commit -m "feat(quick-wins): Section 7 Client Pipeline with Kanban + acquisition channels"
```
