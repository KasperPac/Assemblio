// Scratch only: an in-memory Postgres (PGlite), with no network or production URL.
// npm install --prefix <temporary-dir> --no-save --no-package-lock @electric-sql/pglite
// node scripts/verify-square-db.mjs <temporary-dir>/node_modules/@electric-sql/pglite/dist/index.js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Supply the temporary PGlite module path');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const files = [
  'supabase/__tests__/scratch-prelude.sql',
  'supabase/schema.sql',
  'supabase/__tests__/scratch-prereq-yield-pct.sql',
  'supabase/patches/inventory_movement_delta_reserved.sql',
  'supabase/patches/product_bom_unique_active.sql',
  'supabase/patches/apply_reserved_movement_rpc.sql',
  'supabase/patches/2026-09-02-tenant-isolation-hardening.sql',
  'supabase/patches/bom_component_position.sql',
  'supabase/patches/2026-09-25-retail-stock-foundation.sql',
  'supabase/patches/2026-05-27-orders-source.sql',
  'supabase/patches/2026-10-12-square-connector.sql',
  'supabase/patches/2026-10-12-square-connector.sql', // Idempotent migration rerun.
  'supabase/__tests__/2026-10-12-square-connector.verify.sql',
];
try {
  for (const file of files) {
    // Core Postgres supplies gen_random_uuid; the optional pgcrypto extension
    // is not bundled in this WASM runner. No connector function uses pgcrypto.
    const sql = (await readFile(resolve(file), 'utf8'))
      .replace(/^\\.*$/gm, '')
      .replace(/create extension if not exists "?pgcrypto"?;/gi, '');
    try { await db.exec(sql); }
    catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
    console.log(`PASS ${file}`);
  }
} finally { await db.close(); }
