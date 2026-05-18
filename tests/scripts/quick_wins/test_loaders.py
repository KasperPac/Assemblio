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
