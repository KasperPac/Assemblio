#!/usr/bin/env node
/**
 * Set an existing auth user's password. Nothing else.
 *
 * Unlike scripts/provision_super_admin.mjs, this does NOT touch `profiles` —
 * that script upserts role: "super_admin" and repoints tenant_id at the oldest
 * tenant, which is wrong for any account that already belongs somewhere (the
 * Shopify reviewer account, for one).
 *
 * Takes the user's UUID, not an email: auth.admin.listUsers() returns
 * "Database error finding users" against this project, and the id avoids the
 * lookup entirely. Find it with:
 *   select id from auth.users where email = '...';
 *
 * The password is read from stdin, never from argv, so it stays out of shell
 * history and the process list.
 *
 *   node scripts/set_user_password.mjs --id 3b2620ec-6a1f-40be-b086-cac67936e895
 */
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const idIdx = argv.indexOf("--id");
  const userId = idIdx !== -1 ? argv[idIdx + 1] : "";
  if (!userId) {
    throw new Error("Usage: node scripts/set_user_password.mjs --id <user-uuid>");
  }

  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !service) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const supabase = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: found, error: findError } = await supabase.auth.admin.getUserById(userId);
  if (findError) throw new Error(findError.message);
  if (!found?.user) throw new Error(`No auth user with id ${userId}`);

  // Show where this account lives before changing anything, so a wrong id is
  // obvious before the password is typed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant:tenant_id(name)")
    .eq("id", userId)
    .maybeSingle();
  console.log(`User:   ${found.user.email}`);
  console.log(`Role:   ${profile?.role ?? "(none)"}`);
  console.log(`Tenant: ${profile?.tenant?.name ?? "(no tenant)"}`);
  console.log("");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const password = await rl.question("New password (min 12 chars, input is visible): ");
    if (password.length < 12) throw new Error("Password must be at least 12 characters");
    const confirm = await rl.question("Confirm: ");
    if (password !== confirm) throw new Error("Passwords do not match");

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    console.log(`\nPassword updated for ${found.user.email}. Role and tenant unchanged.`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exitCode = 1;
});
