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
