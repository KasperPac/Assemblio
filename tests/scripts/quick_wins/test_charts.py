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
    assert point["x"] == 10  # (7+14)//2 midpoint
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
