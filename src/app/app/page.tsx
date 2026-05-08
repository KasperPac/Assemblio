import styles from "./dashboard.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import EmptyState from "./_ui/empty-state";
import { loadDashboardConfig } from "@/lib/dashboard/config";
import { WIDGET_CATALOG } from "@/lib/dashboard/types";
import { renderWidget } from "./_dashboard/render-widget";

export default async function DashboardPage() {
  const context = await getServerTenantContext();

  if (!context) {
    return (
      <div className={styles.dashboard}>
        <section className={styles.section}>
          <EmptyState
            title="Workspace unavailable"
            message="Could not resolve the active tenant for this dashboard."
          />
        </section>
      </div>
    );
  }

  const { supabase, tenantId } = context;
  const widgetIds = await loadDashboardConfig(supabase, tenantId);

  const sizeClass = {
    stat: styles.widgetStat,
    half: styles.widgetHalf,
    full: styles.widgetFull,
  } as const;

  return (
    <div className={styles.dashboard}>
      <div className={styles.widgetGrid}>
        {widgetIds.map((id) => {
          const meta = WIDGET_CATALOG.find((w) => w.id === id);
          const colClass = meta ? sizeClass[meta.size] : styles.widgetHalf;
          return (
            <div key={id} className={colClass}>
              {renderWidget(id, { supabase, tenantId })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
