#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    email: "",
    password: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--email" && argv[i + 1]) {
      args.email = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--password" && argv[i + 1]) {
      args.password = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  loadEnvFile(".env.local");
  const { email, password } = parseArgs(process.argv.slice(2));
  if (!email || !password) {
    throw new Error("Usage: node scripts/provision_super_admin.mjs --email you@company.com --password temp-password");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !service) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId = "";
  let created = false;
  const createdRes = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!createdRes.error && createdRes.data?.user?.id) {
    userId = createdRes.data.user.id;
    created = true;
  } else {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = (listed.data?.users ?? []).find(
      (user) => (user.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (!existing?.id) {
      throw new Error(createdRes.error?.message ?? "Unable to create/find user");
    }
    userId = existing.id;
    const updateRes = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateRes.error) throw new Error(updateRes.error.message);
  }

  const tenantRes = await supabase
    .from("tenant")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (tenantRes.error || !tenantRes.data?.id) {
    throw new Error(tenantRes.error?.message ?? "No tenant found");
  }

  const profileRes = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        tenant_id: tenantRes.data.id,
        role: "super_admin",
      },
      { onConflict: "id" }
    );
  if (profileRes.error) throw new Error(profileRes.error.message);

  let membershipStatus = "profile_tenant_access_missing";
  const ptaProbe = await supabase.from("profile_tenant_access").select("id").limit(1);
  if (!ptaProbe.error) {
    const allTenants = await supabase.from("tenant").select("id");
    if (allTenants.error) throw new Error(allTenants.error.message);
    const membershipRows = (allTenants.data ?? []).map((tenant) => ({
      profile_id: userId,
      tenant_id: tenant.id,
      role: "admin",
    }));
    if (membershipRows.length > 0) {
      const upsertMembership = await supabase
        .from("profile_tenant_access")
        .upsert(membershipRows, { onConflict: "profile_id,tenant_id" });
      if (upsertMembership.error) throw new Error(upsertMembership.error.message);
    }
    membershipStatus = `granted:${membershipRows.length}`;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        userId,
        membershipStatus,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
