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
    # SEG_A: arpu 245 * weight 4000; SEG_B: arpu 350 * weight 2000
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
