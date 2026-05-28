"""Integrations roadmap data — waves, data flows, competitor matrix."""
from __future__ import annotations

INTEGRATIONS: list[dict] = [
    {
        "name": "Shopify",
        "wave": 0,
        "status": "shipped",
        "data_flows": [
            "Orders in (webhook, real-time)",
            "Stock push (finished goods)",
            "Fulfilment writeback + tracking",
            "Returns: not yet synced",
        ],
        "gotcha": "Shopify returns are NOT synced — must be handled manually.",
    },
    {
        "name": "Xero",
        "wave": 1,
        "status": "in_progress",
        "data_flows": [
            "Sales invoices (AR)",
            "Purchase bills (AP)",
            "Per-production-order COGS journal",
            "WIP roll-forward journal",
            "Variance lines (PPV, MUV, scrap)",
        ],
        "gotcha": "Tracking categories hard-capped at 2 active; granular OAuth scopes mandatory from March 2026.",
    },
    {
        "name": "WooCommerce",
        "wave": 2,
        "status": "planned",
        "data_flows": [
            "Orders in (webhook)",
            "Stock push",
            "Fulfilment writeback",
        ],
        "gotcha": "Auth is per-store key pair (not OAuth); FastCGI hosts may strip Authorization header.",
    },
    {
        "name": "Amazon AU",
        "wave": 2,
        "status": "planned",
        "data_flows": [
            "Orders in (polling + ORDER_CHANGE notifications)",
            "FBA inventory reconciliation",
            "FBM fulfilment writeback",
        ],
        "gotcha": "Amazon AU is a separate seller account from US/EU; marketplace ID A39IBJ37TRP1C6 (Far East cluster).",
    },
    {
        "name": "QuickBooks Online",
        "wave": 2,
        "status": "planned",
        "data_flows": [
            "Sales invoices (AR)",
            "Purchase bills (AP)",
            "COGS journal (Xero parity)",
        ],
        "gotcha": "Negligible AU market share — priority secondary to Xero; relevant for US expansion.",
    },
    {
        "name": "MyOB AccountRight",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Purchase bills (AP)",
            "Sales invoices (AR)",
            "COGS journal",
            "Inventory Adjustment for build events",
        ],
        "gotcha": "Requires x-myobapi-cftoken header alongside OAuth; no hosted sandbox with seeded data.",
    },
    {
        "name": "Etsy",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Orders in (polling — no webhooks available)",
            "Stock push",
            "Listing sync",
        ],
        "gotcha": "Rate limit: 10k QPD shared across ALL shops — scaling risk at multi-tenant volumes.",
    },
    {
        "name": "eBay AU",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Orders in",
            "Stock push",
            "Fulfilment writeback with tracking number",
        ],
        "gotcha": "Must set marketplaceId: EBAY_AU on every offer — wrong value lists on .com not .com.au.",
    },
    {
        "name": "Starshipit",
        "wave": 3,
        "status": "planned",
        "data_flows": [
            "Outbound order handoff (ready-to-ship orders)",
            "Tracking number writeback to source channel",
        ],
        "gotcha": "AU-native carrier roster (AusPost, StarTrack, Aramex, Sendle); follow existing Katana/Cin7 connector pattern.",
    },
    {
        "name": "A2X",
        "wave": None,
        "status": "partner",
        "data_flows": [
            "Payout reconciliation (revenue side)",
            "Channel fees, refunds, GST → Xero/MyOB",
        ],
        "gotcha": "Not built by Manuva — partner recommendation. A2X handles revenue journals; Manuva handles COGS. Accounts don't overlap.",
    },
]

# Maps integration name → competitor name → cell display value.
COMPETITOR_MATRIX: dict[str, dict[str, str]] = {
    "Shopify":            {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "Native",  "Manuva": "Shipped"},
    "Xero":               {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 1"},
    "WooCommerce":        {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "Native",  "Manuva": "Wave 2"},
    "Amazon AU":          {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "Native",  "Manuva": "Wave 2"},
    "QuickBooks Online":  {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "Native",       "Craftybase": "Native",       "inFlow": "None",    "Manuva": "Wave 2"},
    "MyOB AccountRight":  {"Katana": "None",         "Cin7 Core": "None",    "MRPeasy": "None",         "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 3"},
    "Etsy":               {"Katana": "Via Extensiv", "Cin7 Core": "Native",  "MRPeasy": "Zapier only",  "Craftybase": "Native",       "inFlow": "None",    "Manuva": "Wave 3"},
    "eBay AU":            {"Katana": "Via Extensiv", "Cin7 Core": "Native",  "MRPeasy": "Zapier only",  "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 3"},
    "Starshipit":         {"Katana": "Native",       "Cin7 Core": "Native",  "MRPeasy": "None",         "Craftybase": "None",         "inFlow": "None",    "Manuva": "Wave 3"},
    "A2X":                {"Katana": "None",         "Cin7 Core": "None",    "MRPeasy": "None",         "Craftybase": "None",         "inFlow": "None",    "Manuva": "Partner"},
}
