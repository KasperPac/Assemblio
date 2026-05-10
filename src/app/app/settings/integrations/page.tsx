import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import ShopifyManage from "./shopify-manage";
import StatusBanner from "./status-banner";
import styles from "./integrations.module.css";

type Props = {
  searchParams?: Promise<{
    shopify?: string;
    sync_error?: string;
    products?: string;
    orders?: string;
  }>;
};

export default async function IntegrationsPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const params = (await searchParams) ?? {};

  const { data: stores } = await ctx.supabase
    .from("shopify_store")
    .select(
      "id,store_domain,status,created_at,last_synced_at,last_sync_status,last_sync_meta"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  const connected = (stores ?? []).some((s) => s.status === "active");

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect external services to sync catalog, orders, and inventory."
      />
      {params.shopify && (
        <StatusBanner
          status={params.shopify}
          detail={params.sync_error}
          products={params.products}
          orders={params.orders}
        />
      )}
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardName}>Shopify</span>
              <StatusBadge variant={connected ? "success" : "warning"}>
                {connected ? "Connected" : "Not connected"}
              </StatusBadge>
            </div>
            <p className={styles.cardDesc}>
              Sync products, variants, and orders from your Shopify store.
            </p>
          </div>
          <ShopifyManage stores={stores ?? []} />
        </div>
      </div>
    </>
  );
}
