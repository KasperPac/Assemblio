#!/usr/bin/env node
// Generate report.md from outline.yaml + fields.yaml + results/*.json
// Node port of the research-report skill's generate_report.py.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let yamlMod;
try { yamlMod = require("js-yaml"); }
catch { yamlMod = require(resolve(process.cwd(), "node_modules/js-yaml")); }

const ROOT = resolve(import.meta.url.replace(/^file:\/\/\//, "").replace(/\/[^/]+$/, ""));
const outlinePath = resolve(ROOT, "outline.yaml");
const fieldsPath = resolve(ROOT, "fields.yaml");
const outline = yamlMod.load(readFileSync(outlinePath, "utf8"));
const fieldsCfg = yamlMod.load(readFileSync(fieldsPath, "utf8"));
const resultsDir = resolve(ROOT, outline.execution.output_dir);

// TOC summary fields (chosen defaults)
const TOC_FIELDS = [
  ["target_segment", "Segment"],
  ["starting_price_usd", "Entry $"],
  ["shopify_app_rating", "Shopify★"],
  ["g2_rating", "G2★"],
  ["owner_parent_company", "Parent"],
];

const SKIP_KEYS = new Set(["_source_file", "uncertain"]);
const isUncertainVal = (v) => v == null || v === "" || (typeof v === "string" && v.toLowerCase().includes("[uncertain]"));

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function fmtVal(v, depth = 0) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    if (v.every((x) => typeof x !== "object" || x === null)) {
      const joined = v.map((x) => String(x)).join(", ");
      return joined.length > 120 ? v.map((x) => `- ${x}`).join("\n") : joined;
    }
    return v.map((x, i) => `- ${fmtVal(x, depth + 1).replace(/\n/g, "\n  ")}`).join("\n");
  }
  if (typeof v === "object") {
    const lines = [];
    for (const [k, vv] of Object.entries(v)) {
      const f = fmtVal(vv, depth + 1);
      if (f) lines.push(`${k}: ${f.includes("\n") ? "\n" + f.replace(/^/gm, "  ") : f}`);
    }
    return lines.join(depth === 0 ? "\n" : " | ");
  }
  return String(v);
}

function findVal(json, fieldName) {
  if (fieldName in json && !SKIP_KEYS.has(fieldName)) return json[fieldName];
  for (const [k, v] of Object.entries(json)) {
    if (v && typeof v === "object" && !Array.isArray(v) && fieldName in v) return v[fieldName];
  }
  return undefined;
}

// Load JSONs in the order from outline.yaml
const items = outline.items;
const loaded = [];
for (const item of items) {
  const candidates = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
  // Try to match by slugified name → file
  const nameSlug = item.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  let match = candidates.find((f) => f === `${nameSlug}.json`);
  if (!match) {
    const lc = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    match = candidates.find((f) => f.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(lc.slice(0, 8)));
  }
  if (!match) { console.warn(`[WARN] no JSON for ${item.name}`); continue; }
  const j = JSON.parse(readFileSync(join(resultsDir, match), "utf8").replace(/^﻿/, ""));
  loaded.push({ item, json: j, file: match });
}

const lines = [];
lines.push(`# ${outline.topic}\n`);
lines.push(`> Auto-generated on ${new Date().toISOString().slice(0, 10)} from ${loaded.length} researched items.\n`);
lines.push(`> Source files: \`${outline.execution.output_dir}\`\n`);
if (outline.notes) lines.push(`\n${outline.notes.trim()}\n`);

// Table of Contents with summary fields
lines.push(`\n## Table of contents\n`);
lines.push(`| # | Product | ${TOC_FIELDS.map((f) => f[1]).join(" | ")} |`);
lines.push(`|---|---|${TOC_FIELDS.map(() => "---").join("|")}|`);
let idx = 0;
for (const { item, json } of loaded) {
  idx++;
  const cells = TOC_FIELDS.map(([key]) => {
    const v = findVal(json, key);
    if (isUncertainVal(v)) return "—";
    return String(v).replace(/\|/g, "\\|").slice(0, 80);
  });
  lines.push(`| ${idx} | [${item.name}](#${slug(item.name)}) | ${cells.join(" | ")} |`);
}

// Per-item details
lines.push(`\n---\n`);
idx = 0;
for (const { item, json } of loaded) {
  idx++;
  lines.push(`\n## ${item.name}\n`);
  lines.push(`**Category:** ${item.category}  `);
  if (item.description) lines.push(`**Why included:** ${item.description}  \n`);

  const uncertainSet = new Set(Array.isArray(json.uncertain) ? json.uncertain : []);
  const usedFields = new Set();

  for (const cat of fieldsCfg.field_categories) {
    const catLines = [];
    for (const f of cat.fields) {
      const v = findVal(json, f.name);
      if (uncertainSet.has(f.name)) continue;
      if (isUncertainVal(v)) continue;
      catLines.push(`- **${f.name}**: ${fmtVal(v)}`);
      usedFields.add(f.name);
    }
    if (catLines.length) {
      lines.push(`\n### ${cat.category}\n`);
      lines.push(catLines.join("\n"));
    }
  }

  // Other / extra fields not in fields.yaml
  const definedNames = new Set(fieldsCfg.field_categories.flatMap((c) => c.fields.map((f) => f.name)));
  const extras = [];
  for (const [k, v] of Object.entries(json)) {
    if (SKIP_KEYS.has(k)) continue;
    if (definedNames.has(k)) continue;
    if (uncertainSet.has(k)) continue;
    if (isUncertainVal(v)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) continue; // skip nested groupings
    extras.push(`- **${k}**: ${fmtVal(v)}`);
  }
  if (extras.length) {
    lines.push(`\n### Other info\n`);
    lines.push(extras.join("\n"));
  }

  if (uncertainSet.size) {
    lines.push(`\n### Uncertain (${uncertainSet.size})\n`);
    lines.push([...uncertainSet].map((u) => `- ${u}`).join("\n"));
  }
}

const out = lines.join("\n") + "\n";
const reportPath = resolve(ROOT, "report.md");
writeFileSync(reportPath, out, "utf8");
console.log(`Wrote ${reportPath} (${out.length.toLocaleString()} chars, ${out.split("\n").length} lines)`);
