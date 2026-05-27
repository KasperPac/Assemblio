#!/usr/bin/env node
// Node port of validate_json.py — validates research JSON output against fields.yaml.
// Usage:
//   node validate_json.mjs -f <fields.yaml> -j <out1.json> [<out2.json> ...]
//   node validate_json.mjs -f <fields.yaml> -d <dir>

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { parseArgs } from "node:util";

const require = (await import("node:module")).createRequire(import.meta.url);
let yamlModule;
try {
  yamlModule = require("js-yaml");
} catch {
  yamlModule = require(resolve(process.cwd(), "node_modules/js-yaml"));
}

const CATEGORY_MAPPING = {
  basic_info: ["basic_info", "Basic Info"],
  technical_features: ["technical_features", "technical_characteristics", "Technical Features"],
  performance_metrics: ["performance_metrics", "performance", "Performance Metrics"],
  milestone_significance: ["milestone_significance", "milestones", "Milestone Significance"],
  business_info: ["business_info", "commercial_info", "Business Info"],
  competition_ecosystem: ["competition_ecosystem", "competition", "Competition Ecosystem"],
  history: ["history", "History"],
  market_positioning: ["market_positioning", "market", "Market Positioning"],
};
const SKIP_KEYS = new Set(["_source_file", "uncertain"]);

function loadFieldsYaml(fieldsPath) {
  const data = yamlModule.load(readFileSync(fieldsPath, "utf8")) ?? {};
  const items = [];
  for (const cat of data.field_categories ?? []) {
    for (const f of cat.fields ?? []) {
      items.push({ name: f.name, category: cat.category, required: Boolean(f.required) });
    }
  }
  const all = new Set(items.map((i) => i.name));
  const required = new Set(items.filter((i) => i.required).map((i) => i.name));
  const byField = Object.fromEntries(items.map((i) => [i.name, i.category]));
  return { all, required, byField };
}

function extractFields(data) {
  const nestedKeys = new Set(Object.values(CATEGORY_MAPPING).flat());
  const out = new Set();
  const stack = [[data, true]];
  while (stack.length) {
    const [obj, isCategoryLevel] = stack.pop();
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        if (SKIP_KEYS.has(k)) continue;
        if (isCategoryLevel && nestedKeys.has(k)) {
          if (v && typeof v === "object" && !Array.isArray(v)) stack.push([v, true]);
          continue;
        }
        out.add(k);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) if (item && typeof item === "object") stack.push([item, isCategoryLevel]);
    }
  }
  return out;
}

function diff(a, b) {
  const out = new Set();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
}
function intersect(a, b) {
  const out = new Set();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function validate(jsonPath, all, required, byField) {
  const raw = readFileSync(jsonPath, "utf8").replace(/^﻿/, "");
  const data = JSON.parse(raw);
  const found = extractFields(data);
  const covered = intersect(all, found);
  const missing = diff(all, found);
  const extra = diff(found, all);
  const missingRequired = intersect(missing, required);
  const missingByCategory = {};
  for (const f of missing) {
    const cat = byField[f] ?? "Unknown";
    (missingByCategory[cat] ??= []).push(f);
  }
  for (const v of Object.values(missingByCategory)) v.sort();
  return {
    file: basename(jsonPath),
    total_defined: all.size,
    covered: covered.size,
    missing: missing.size,
    extra: extra.size,
    coverage_rate: all.size ? (covered.size / all.size) * 100 : 100,
    missing_required: [...missingRequired].sort(),
    missing_optional: [...diff(missing, required)].sort(),
    missing_by_category: missingByCategory,
    extra_fields: [...extra].sort(),
    valid: missingRequired.size === 0,
  };
}

function printResult(r, verbose) {
  const line = "=".repeat(60);
  const status = r.valid ? "PASS" : "FAIL";
  console.log(`\n${line}\n[${status}] ${r.file}\n${line}`);
  console.log(`Coverage: ${r.coverage_rate.toFixed(1)}% (${r.covered}/${r.total_defined})`);
  if (r.missing_required.length) {
    console.log(`\n[ERROR] Missing required fields (${r.missing_required.length}):`);
    for (const f of r.missing_required) console.log(`  - ${f}`);
  }
  if (verbose && r.missing_optional.length) {
    const missingRequired = new Set(r.missing_required);
    console.log(`\n[WARN] Missing optional fields (${r.missing_optional.length}):`);
    for (const cat of Object.keys(r.missing_by_category).sort()) {
      const opt = r.missing_by_category[cat].filter((f) => !missingRequired.has(f));
      if (opt.length) console.log(`  [${cat}]: ${opt.join(", ")}`);
    }
  }
  if (verbose && r.extra_fields.length) {
    console.log(`\n[INFO] Extra fields (${r.extra_fields.length}):`);
    console.log(`  ${r.extra_fields.slice(0, 10).join(", ")}`);
    if (r.extra_fields.length > 10) console.log(`  ... and ${r.extra_fields.length - 10} more`);
  }
}

const { values, positionals } = parseArgs({
  options: {
    fields: { type: "string", short: "f", default: "fields.yaml" },
    json: { type: "string", short: "j", multiple: true },
    dir: { type: "string", short: "d", default: "results" },
    quiet: { type: "boolean", short: "q", default: false },
  },
  allowPositionals: true,
});

let fieldsPath = resolve(values.fields);
if (!existsSync(fieldsPath)) {
  for (const p of [resolve("fields.yaml"), resolve("..", "fields.yaml")]) {
    if (existsSync(p)) { fieldsPath = p; break; }
  }
}
if (!existsSync(fieldsPath)) {
  console.error(`[ERROR] fields.yaml not found: ${fieldsPath}`);
  process.exit(1);
}
console.log(`Field definition file: ${fieldsPath}`);
const { all, required, byField } = loadFieldsYaml(fieldsPath);
console.log(`Total fields: ${all.size} (required: ${required.size}, optional: ${all.size - required.size})`);

let jsonFiles = (values.json ?? []).concat(positionals).map((p) => resolve(p));
if (!jsonFiles.length && existsSync(values.dir)) {
  jsonFiles = readdirSync(values.dir).filter((f) => f.endsWith(".json")).map((f) => join(values.dir, f)).sort();
}
if (!jsonFiles.length) { console.log("[WARN] No JSON files found"); process.exit(0); }

const results = [];
for (const p of jsonFiles) {
  if (!existsSync(p)) { console.log(`[WARN] File not found: ${p}`); continue; }
  const r = validate(p, all, required, byField);
  results.push(r);
  printResult(r, !values.quiet);
}
const line = "=".repeat(60);
console.log(`\n${line}\nSummary\n${line}`);
const passed = results.filter((r) => r.valid).length;
const avg = results.length ? results.reduce((s, r) => s + r.coverage_rate, 0) / results.length : 0;
console.log(`Validation passed: ${passed}/${results.length}`);
console.log(`Average coverage: ${avg.toFixed(1)}%`);
if (passed < results.length) process.exit(1);
