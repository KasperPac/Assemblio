"""Competitor feature gap data for the quick-wins dashboard."""
from __future__ import annotations

# Ordered by severity desc then competitor_count desc — matches table render order.
FEATURE_GAPS: list[dict] = [
    {"name": "Accounting integration (Xero / QuickBooks)", "severity": "critical", "competitor_count": 6, "default_status": "in_progress"},
    {"name": "Lot / batch / serial tracking",              "severity": "critical", "competitor_count": 5, "default_status": "backlog"},
    {"name": "Multi-channel ecommerce (WooCommerce, Amazon)", "severity": "high",  "competitor_count": 6, "default_status": "planned"},
    {"name": "Reorder points / auto-PO",                   "severity": "high",     "competitor_count": 5, "default_status": "backlog"},
    {"name": "Export PDF / CSV on Growth tier",            "severity": "high",     "competitor_count": 7, "default_status": "backlog"},
    {"name": "Multi-currency",                             "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "Visual production scheduler",                "severity": "medium",   "competitor_count": 3, "default_status": "backlog"},
    {"name": "Barcode scanning",                           "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "Mobile app",                                 "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "Batch production tracking",                  "severity": "medium",   "competitor_count": 4, "default_status": "backlog"},
    {"name": "B2B / wholesale portal",                     "severity": "low",      "competitor_count": 2, "default_status": "backlog"},
    {"name": "Subcontracting",                             "severity": "low",      "competitor_count": 1, "default_status": "backlog"},
    {"name": "CRM / customer management",                  "severity": "low",      "competitor_count": 1, "default_status": "backlog"},
]

MANUVA_ADVANTAGES: list[str] = [
    "Yield % per BOM line — unique at this price range (Katana has none at any price)",
    "BOM versioning + templates — exclusive at $249/mo",
    "Unlimited users flat pricing — Katana hits $807/mo with equivalent add-ons",
    "Capacity planning + staff costing at Pro — no direct competitor at $499/mo flat",
]
