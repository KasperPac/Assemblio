"""Filter the 30 GTM segments down to the 9 quick wins."""
from __future__ import annotations

from .loaders import find_field, parse_mrr_range, parse_phase, parse_priority

QUICK_WIN_TIERS = {"A", "B"}


def _is_addressable_now(segment: dict) -> bool:
    aw = find_field(segment, "addressable_window")
    if not aw:
        return False
    return str(aw).strip().lower().startswith("now")


def filter_quick_wins(segments: dict[str, dict]) -> list[dict]:
    """Return the Tier-A/B, Phase-1, priority≤2, addressable-now segments, sorted for display."""
    qw: list[dict] = []
    for seg in segments.values():
        tier = seg.get("tier")
        if tier not in QUICK_WIN_TIERS:
            continue
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
