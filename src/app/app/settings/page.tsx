import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function SettingsPage() {
  const ctx = await getServerTenantContext();
  const isAdmin = ctx?.role === "admin" || ctx?.role === "super_admin";
  redirect(isAdmin ? "/app/settings/company" : "/app/settings/profile");
}
