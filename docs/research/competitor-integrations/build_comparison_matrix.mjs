#!/usr/bin/env node
// Build comparison-matrix.csv from outline.yaml + results/*.json
// Columns: 28 products × selected fields.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let yamlMod;
try { yamlMod = require("js-yaml"); }
catch { yamlMod = require(resolve(process.cwd(), "node_modules/js-yaml")); }

const ROOT = resolve(import.meta.url.replace(/^file:\/\/\//, "").replace(/\/[^/]+$/, ""));
const outline = yamlMod.load(readFileSync(resolve(ROOT, "outline.yaml"), "utf8"));
const resultsDir = resolve(ROOT, outline.execution.output_dir);

const COLUMNS = [
  ["product_name", "Product"],
  ["vendor_company", "Vendor"],
  ["hq_country", "HQ"],
  ["target_segment", "Segment"],
  ["target_vertical", "Vertical"],
  ["pricing_model", "Pricing model"],
  ["starting_price_usd", "Entry price"],
  ["owner_parent_company", "Parent / owner"],
  ["last_funding_event", "Last funding"],

  ["shopify_supported", "Shopify"],
  ["shopify_app_rating", "Shopify rating"],
  ["shopify_built_for_shopify_badge", "BFS badge"],
  ["shopify_plus_partner_status", "Plus partner"],
  ["shopify_real_time_or_batch", "Shopify sync mode"],
  ["shopify_b2b_catalog_support", "Shopify B2B"],
  ["shopify_markets_support", "Shopify Markets"],

  ["etsy_supported", "Etsy"],
  ["etsy_native_or_third_party", "Etsy native?"],

  ["amazon_supported", "Amazon"],
  ["amazon_marketplaces", "Amazon marketplaces"],
  ["amazon_seller_types", "FBA/FBM"],
  ["amazon_buy_shipping", "Amazon Buy Shipping"],
  ["amazon_settlement_report_handling", "Amazon settlement"],
  ["amazon_marketplace_facilitator_tax_handling", "MFT handling"],
  ["amazon_sp_api_inbound_v2024_03_20", "SP-API Inbound v2024-03-20"],

  ["xero_supported", "Xero"],
  ["xero_app_store_certified", "Xero certified"],
  ["xero_app_awards_recognition", "Xero awards"],
  ["xero_accounting_sync_mode", "Xero sync mode"],
  ["xero_cogs_journal_method", "Xero COGS method"],
  ["xero_tracking_category_mapping", "Xero tracking categories"],
  ["xero_multi_currency", "Xero multi-currency"],

  ["qb_online_supported", "QBO"],
  ["qb_desktop_supported", "QB Desktop"],
  ["qb_accounting_sync_mode", "QB sync mode"],
  ["qb_cogs_journal_method", "QB COGS method"],
  ["qb_class_location_mapping", "QB Class/Location"],

  ["other_ecom_channels", "Other e-com channels"],
  ["bundle_kit_component_decomposition", "Bundle decomposition"],

  ["bom_support", "BOM"],
  ["multi_level_bom", "Multi-level BOM"],
  ["production_orders", "Production orders"],
  ["batch_lot_tracking", "Lot tracking"],
  ["serial_tracking", "Serial tracking"],
  ["bin_location_support", "Bin locations"],
  ["multi_warehouse", "Multi-warehouse"],
  ["landed_cost_support", "Landed cost"],

  ["ai_demand_forecasting", "AI forecasting"],
  ["ai_purchase_order_suggestions", "AI PO suggest"],
  ["ai_natural_language_query", "AI NL query"],

  ["public_api", "Public API"],
  ["webhook_event_coverage", "Webhooks"],
  ["integration_architecture", "Integration arch"],
  ["zapier_make_support", "Zapier/Make"],
  ["mobile_app", "Mobile app"],
  ["edi_support", "EDI"],
  ["three_pl_integrations", "3PL integrations"],

  ["g2_rating", "G2"],
  ["capterra_rating", "Capterra"],
];

const isUncertain = (v) => v == null || v === "" || (typeof v === "string" && v.toLowerCase().includes("[uncertain]"));

function findVal(json, name) {
  if (name in json) return json[name];
  for (const v of Object.values(json)) {
    if (v && typeof v === "object" && !Array.isArray(v) && name in v) return v[name];
  }
  return undefined;
}

function compact(v) {
  if (isUncertain(v)) return "";
  let s = typeof v === "string" ? v : JSON.stringify(v);
  // Collapse whitespace and truncate to keep CSV readable in spreadsheet apps
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 220) s = s.slice(0, 217) + "...";
  return s;
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Load JSON for each outline item in outline order
const allFiles = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
const rows = [];
for (const item of outline.items) {
  const slug = item.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  let match = allFiles.find((f) => f === `${slug}.json`);
  if (!match) {
    const lc = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    match = allFiles.find((f) => f.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(lc.slice(0, 8)));
  }
  if (!match) { console.warn(`[WARN] no JSON for ${item.name}`); continue; }
  const j = JSON.parse(readFileSync(join(resultsDir, match), "utf8").replace(/^﻿/, ""));
  const row = [item.name];
  for (const [field] of COLUMNS) row.push(compact(findVal(j, field)));
  rows.push(row);
}

// Build CSV
const header = ["Item (outline name)", ...COLUMNS.map(([, label]) => label)];
const lines = [header.map(csvCell).join(",")];
for (const r of rows) lines.push(r.map(csvCell).join(","));
const outPath = resolve(ROOT, "comparison-matrix.csv");
writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${outPath} — ${rows.length} rows × ${header.length} cols`);
