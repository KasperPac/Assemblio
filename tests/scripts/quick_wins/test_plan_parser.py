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
