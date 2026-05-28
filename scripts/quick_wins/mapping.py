"""Workstream and segment-keyword classifiers for plan tasks."""
from __future__ import annotations

import re

# Order matters: first match wins.
WORKSTREAM_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("Content", re.compile(
        r"\b(publish\s+(pillar|post|case)|post\s+in|launch\s+(a\s+)?webinar|submit\s+(a\s+)?(speaker|pitch)|write\s+(the\s+)?(pillar|draft)|content\s+hub|carousel)\b",
        re.I,
    )),
    ("Build", re.compile(
        r"\b(ship|build|draft\s+(the\s+)?(xero|spec|epic)|deploy|set\s+up\s+(a\s+|the\s+)?(dashboard|metrics|weekly)|develop|publish\s+charter|publish\s+\w+\s+(landing|page|screen|wizard|integration))\b",
        re.I,
    )),
    ("Sell", re.compile(
        r"\b(send\s+\d+|send\s+outreach|send\s+.{0,20}(DM|invite)|DM\b|outreach|run\s+\d+.{0,30}(discovery|demo|pilot|paid|inbound|outbound|advisor|cold)\b|sign\s+\d+|convert\s+\d+|pitch|reach\s+out|schedule\s+\d+.{0,30}(intro\s+)?(Zoom\s+)?calls?)\b",
        re.I,
    )),
    ("Support", re.compile(
        r"\b(run\s+(the\s+|first\s+|second\s+|third\s+|fourth\s+)?(bi-weekly|cadence|charter\s+cadence)|onboard|triage|run\s+the\s+.{0,30}(review|cadence\s+call)|review\s+session)\b",
        re.I,
    )),
]

_FALLBACK_VERBS: dict[str, str] = {
    "publish": "Content",
    "ship": "Build",
    "build": "Build",
    "send": "Sell",
    "run": "Sell",
    "post": "Content",
    "write": "Content",
    "draft": "Build",
    "deploy": "Build",
    "onboard": "Support",
}


def classify_workstream(text: str) -> str:
    """Return one of Build/Sell/Support/Content. First match in WORKSTREAM_RULES wins."""
    for ws, pat in WORKSTREAM_RULES:
        if pat.search(text):
            return ws
    first_word = text.lstrip().split()[0].lower().strip("*:.,") if text.strip() else ""
    return _FALLBACK_VERBS.get(first_word, "Build")


SEGMENT_KEYWORDS: dict[str, list[str]] = {
    "01_indie_cosmetics_skincare": [
        "cosmetic", "skincare", "indie beauty", "Jennifer Rudd",
        "Skincare Business Foundations", "Beauty Industry Group",
    ],
    "04_candle_soap_homefragrance": [
        "candle", "soap", "home fragrance", "Australian Candle Makers",
        "Australian Soapmakers", "Australian Soap Makers",
    ],
    "08_pet_treats_dry": ["pet treat", "dry pet food"],
    "11_packaged_foods_sauces_condiments": ["packaged food", "sauce", "condiment", "FSANZ"],
    "14_functional_ferment_brands": ["ferment", "kombucha", "sauerkraut", "kimchi"],
    "16_katana_defectors": ["Katana", "real-cost calculator", "Brahmin Solutions"],
    "17_craftybase_graduates": ["Craftybase", "Indie tier"],
    "19_unleashed_defectors_anz": ["Unleashed", "NZD billing", "NZD-billed"],
    "21_shopify_plus_no_ops_stack": ["Shopify Plus", "Plus brand"],
}


def match_segments(text: str) -> list[str]:
    """Return segment IDs whose keywords appear in text (case-insensitive substring match)."""
    text_lower = text.lower()
    return [
        seg_id
        for seg_id, keywords in SEGMENT_KEYWORDS.items()
        if any(kw.lower() in text_lower for kw in keywords)
    ]


def annotate_tasks(tasks: list[dict]) -> list[dict]:
    """Add workstream + segments_mentioned to each task dict in-place copy."""
    return [
        {**t, "workstream": classify_workstream(t["text"]), "segments_mentioned": match_segments(t["text"])}
        for t in tasks
    ]
