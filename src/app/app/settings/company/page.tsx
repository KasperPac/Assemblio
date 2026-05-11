import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import CompanyForm from "./company-form";

export default async function CompanyPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { data: tenant } = await ctx.supabase
    .from("tenant")
    .select("name, timezone, currency, logo_url, created_at")
    .eq("id", ctx.tenantId)
    .single();

  if (!tenant) redirect("/app/settings/profile");

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        description="Workspace name, logo, timezone, and currency."
      />
      <CompanyForm
        name={tenant.name}
        timezone={tenant.timezone ?? "Pacific/Auckland"}
        currency={tenant.currency ?? "NZD"}
        logoUrl={tenant.logo_url ?? null}
        createdAt={tenant.created_at}
      />
    </>
  );
}
