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
