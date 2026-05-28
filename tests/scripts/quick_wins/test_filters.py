from pathlib import Path

from scripts.quick_wins.filters import filter_quick_wins
from scripts.quick_wins.loaders import find_field, load_segments, parse_priority

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
    priorities = [parse_priority(find_field(s, "priority_ranking")) for s in quick_wins]
    assert priorities == sorted(priorities)
