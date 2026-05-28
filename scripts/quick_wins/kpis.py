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
