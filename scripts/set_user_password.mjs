#!/usr/bin/env node
/**
 * Set an existing auth user's password. Nothing else.
 *
 * Unlike scripts/provision_super_admin.mjs, this does NOT touch `profiles` —
 * that script upserts role: "super_admin" and repoints tenant_id at the oldest
 * tenant, which is wrong for any account that already belongs somewhere (the
 * Shopify reviewer account, for one).
 *
 * The password is read from stdin, never from argv, so it stays out of shell
 * history and the process list.
 *
 *   node scripts/set_user_password.mjs --email reviewer@manuva.app
 */
import fs from "node:fs";
import readline from "node:readline";
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

function readSecret(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if (["\n", "\r", "\u0004"].includes(char.toString())) {
        process.stdin.removeListener("data", onData);
      } else {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(prompt + "*".repeat(rl.line.length));
      }
    };
    process.stdin.on("data", onData);
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const emailIdx = argv.indexOf("--email");
  const email = emailIdx !== -1 ? argv[emailIdx + 1] : "";
  if (!email) throw new Error("Usage: node scripts/set_user_password.mjs --email someone@example.com");

  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !service) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

  const supabase = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error(listed.error.message);
  const user = (listed.data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  if (!user?.id) throw new Error(`No auth user found for ${email}`);

  // Show where this account lives before changing anything, so a wrong email
  // is obvious before the password is typed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant:tenant_id(name)")
    .eq("id", user.id)
    .maybeSingle();
  const tenantName = profile?.tenant?.name ?? "(no tenant)";
  console.log(`User:   ${user.email}`);
  console.log(`Role:   ${profile?.role ?? "(none)"}`);
  console.log(`Tenant: ${tenantName}`);
  console.log("");

  const password = await readSecret("New password (min 12 chars): ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  const confirm = await readSecret("Confirm: ");
  if (password !== confirm) throw new Error("Passwords do not match");

  const res = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (res.error) throw new Error(res.error.message);

  console.log(`\nPassword updated for ${user.email}. Role and tenant unchanged.`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
