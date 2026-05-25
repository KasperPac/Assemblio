#!/usr/bin/env node

/**
 * Seed a Shopify development store with realistic fake products.
 *
 * Designed to support App Store reviewer / demo flows: creates an artisan
 * candle catalog (~15 products, 30-60 variants) where each variant has a
 * predictable SKU pattern that downstream Manuva BOM seeding can key on.
 *
 * The script reads the access token for the target shop from Manuva's
 * shopify_install_tokens table — so the app must already be installed on
 * the dev store before running.
 *
 * USAGE
 *   $env:NEXT_PUBLIC_SUPABASE_URL = "https://<project>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *   node scripts/seed_shopify_dev_store.mjs --shop your-store.myshopify.com [--count 15]
 *
 * FLAGS
 *   --shop <domain>     Required. Full myshopify.com domain.
 *   --count <n>         Optional. Number of products to create. Default 15.
 *   --api-version <v>   Optional. Admin API version. Default 2026-01.
 */

import { createClient } from "@supabase/supabase-js";

// ── CLI args ────────────────────────────────────────────────────────────────

function getArg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const shopDomain = getArg("--shop");
const productCount = Number(getArg("--count", "15"));
const apiVersion = getArg("--api-version", "2026-01");

if (!shopDomain || !shopDomain.endsWith(".myshopify.com")) {
  console.error("Required: --shop <your-store.myshopify.com>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error("Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ── Catalog ─────────────────────────────────────────────────────────────────
//
// Each product is an artisan candle. Variants are size (250g / 400g / 800g).
// SKUs follow CANDLE-<SCENT>-<SIZE>. Components in the matching Manuva seed
// script can key on these SKUs.

const SCENTS = [
  { code: "LAV",  name: "Lavender Fields",      blurb: "Calming lavender harvested from Provence." },
  { code: "VAN",  name: "Vanilla Bourbon",      blurb: "Warm Madagascar vanilla with a hint of bourbon." },
  { code: "EUC",  name: "Eucalyptus Mint",      blurb: "Crisp eucalyptus paired with fresh spearmint." },
  { code: "SAN",  name: "Sandalwood Smoke",     blurb: "Slow-burning sandalwood with smoky undertones." },
  { code: "CIT",  name: "Citrus Grove",         blurb: "Bright lemon, bergamot, and yuzu." },
  { code: "ROS",  name: "Rose Garden",          blurb: "Bulgarian rose petal with subtle musk." },
  { code: "JAS",  name: "Jasmine Night",        blurb: "Heady night-blooming jasmine." },
  { code: "PIN",  name: "Pine Forest",          blurb: "Crushed pine needles and forest moss." },
  { code: "PAT",  name: "Patchouli Earth",      blurb: "Deep earthy patchouli with vetiver." },
  { code: "COC",  name: "Coconut Beach",        blurb: "Sun-warmed coconut and sea salt." },
  { code: "AMB",  name: "Amber Glow",           blurb: "Resinous amber with warm vanilla." },
  { code: "FIG",  name: "Fig & Cassis",         blurb: "Sweet fig with tart blackcurrant." },
  { code: "BER",  name: "Bergamot Tea",         blurb: "Earl Grey-inspired bergamot and black tea." },
  { code: "OUD",  name: "Oud & Saffron",        blurb: "Luxurious oud wood with saffron spice." },
  { code: "CHE",  name: "Cherry Almond",        blurb: "Sweet cherry with toasted almond." },
  { code: "MAR",  name: "Marshmallow",          blurb: "Sugary marshmallow over warm vanilla." },
  { code: "WHI",  name: "White Tea & Pear",     blurb: "Delicate white tea infused with ripe pear." },
  { code: "BOU",  name: "Bourbon Toffee",       blurb: "Smoky bourbon over buttery toffee." },
  { code: "MIN",  name: "Mint Mojito",          blurb: "Crushed mint, lime zest, and white rum." },
  { code: "FOR",  name: "Forest Floor",         blurb: "Damp earth, oak, and fallen leaves." },
];

const SIZES = [
  { code: "250G", label: "250g",  weight: 250, price: 28.00 },
  { code: "400G", label: "400g",  weight: 400, price: 38.00 },
  { code: "800G", label: "800g (Double Wick)", weight: 800, price: 58.00 },
];

const VENDOR = "Manuva Demo Co";
const PRODUCT_TYPE = "Candle";

// ── Supabase: fetch access token ───────────────────────────────────────────

const supabase = createClient(supabaseUrl, serviceKey);

async function getAccessToken(domain) {
  const { data: store, error: storeErr } = await supabase
    .from("shopify_store")
    .select("id, tenant_id")
    .eq("store_domain", domain)
    .maybeSingle();
  if (storeErr) throw new Error(`shopify_store lookup failed: ${storeErr.message}`);
  if (!store) throw new Error(`No shopify_store row for ${domain}. Install Manuva on this store first.`);

  const { data: tok, error: tokErr } = await supabase
    .from("shopify_install_tokens")
    .select("access_token, scopes")
    .eq("shopify_store_id", store.id)
    .maybeSingle();
  if (tokErr) throw new Error(`token lookup failed: ${tokErr.message}`);
  if (!tok?.access_token) throw new Error(`No access token for ${domain}. Reinstall Manuva.`);

  return { accessToken: tok.access_token, scopes: tok.scopes };
}

// ── Shopify Admin GraphQL ──────────────────────────────────────────────────

async function adminGraphql(token, query, variables) {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const PRODUCT_SET_MUTATION = `
  mutation productSet($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product {
        id
        title
        variants(first: 10) {
          nodes { id sku title }
        }
      }
      userErrors { field message }
    }
  }
`;

// ── Build + create products ────────────────────────────────────────────────

function buildProductInput(scent) {
  return {
    title: `${scent.name} Candle`,
    descriptionHtml: `<p>${scent.blurb} Hand-poured in small batches.</p>`,
    vendor: VENDOR,
    productType: PRODUCT_TYPE,
    status: "ACTIVE",
    tags: ["candle", "artisan", "demo", scent.code.toLowerCase()],
    productOptions: [
      {
        name: "Size",
        values: SIZES.map((s) => ({ name: s.label })),
      },
    ],
    variants: SIZES.map((s) => ({
      optionValues: [{ optionName: "Size", name: s.label }],
      sku: `CANDLE-${scent.code}-${s.code}`,
      price: s.price.toFixed(2),
      inventoryItem: { tracked: true, measurement: { weight: { value: s.weight, unit: "GRAMS" } } },
    })),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${productCount} candle products into ${shopDomain}...`);
  const { accessToken, scopes } = await getAccessToken(shopDomain);
  console.log(`  ✓ access token loaded (scopes: ${scopes ?? "unknown"})`);

  const scentsToUse = SCENTS.slice(0, Math.min(productCount, SCENTS.length));
  if (scentsToUse.length < productCount) {
    console.warn(`  ! only ${SCENTS.length} unique scents defined; capping at ${SCENTS.length}`);
  }

  let success = 0;
  let failed = 0;
  for (const [i, scent] of scentsToUse.entries()) {
    const label = `[${i + 1}/${scentsToUse.length}] ${scent.name}`;
    try {
      const data = await adminGraphql(accessToken, PRODUCT_SET_MUTATION, {
        input: buildProductInput(scent),
      });
      const errors = data.productSet.userErrors;
      if (errors.length) {
        console.error(`  ✗ ${label}: ${errors.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
        failed++;
        continue;
      }
      const variantCount = data.productSet.product.variants.nodes.length;
      console.log(`  ✓ ${label} (${variantCount} variants)`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} created, ${failed} failed.`);
  console.log(`Next: trigger a Shopify sync in Manuva so the products + variants land in your tenant.`);
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
