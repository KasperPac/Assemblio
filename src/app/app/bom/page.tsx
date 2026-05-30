import styles from "./bom.module.css";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import BomCreateForm from "./bom-create-form";
import BomComponentLineForm from "./bom-component-line-form";
import {
  createBom,
  createBomComponentLine,
  setBomActive,
  updateBomComponentQuantity,
  updateBomStatus,
} from "./actions";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import HelpLink from "../_ui/help-link";

type BomRow = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  variant:
    | { title: string | null; sku: string | null }
    | Array<{ title: string | null; sku: string | null }>
    | null;
};

type BomComponentRow = {
  id: string;
  quantity: number;
  product_bom:
    | { id: string; version: number }
    | Array<{ id: string; version: number }>
    | null;
  component:
    | { name: string | null; sku: string | null }
    | Array<{ name: string | null; sku: string | null }>
    | null;
};

function getStatusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "success";
  if (normalized === "archived") return "danger";
  return "warning";
}

export default async function BomPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const [{ data, error }, { data: variants }, { data: components }, { data: bomLines }] =
    await Promise.all([
      supabase
        .from("product_bom")
        .select("id,version,status,is_active,variant:variant_id(title,sku)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("product_variant").select("id,title,sku").eq("tenant_id", tenantId).order("title"),
      supabase.from("component").select("id,name,sku").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("product_bom_component")
        .select(
          "id,quantity,product_bom:product_bom_id(id,version),component:component_id(name,sku)"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  return (
    <div className={styles.page}>
      <PageHeader
        description="Maintain versioned bills of materials per Shopify variant and keep component quantities editable in one place."
      />
      <HelpLink slug="bom/allocation" label="How does allocation work?" />

      <BomCreateForm
        variants={
          (variants ?? []) as Array<{ id: string; title: string | null; sku: string | null }>
        }
        action={createBom}
      />
      <BomComponentLineForm
        boms={(data ?? []).map((bom) => {
          const variant = Array.isArray(bom.variant)
            ? bom.variant[0] ?? null
            : bom.variant;
          return {
            id: bom.id,
            label: `v${bom.version} - ${variant?.title ?? "Untitled variant"}`,
          };
        })}
        components={
          ((components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>).map(
            (c) => ({
              id: c.id,
              label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
            })
          )
        }
        action={createBomComponentLine}
      />

      <ListPanel
        eyebrow="Versions"
        title="Variant BOMs"
        description="Switch active BOMs and move versions through draft, active, and archived states."
        columns={["Variant", "Version", "Status", "Active", "Actions"]}
        columnsTemplate="1.5fr 0.6fr 0.8fr 0.6fr 1.4fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load BOMs"
            message="The BOM list could not be retrieved from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No BOMs yet"
            message="Create a BOM to begin mapping variant demand to components."
          />
        ) : (
          (data as BomRow[]).map((row) => {
            const variant = Array.isArray(row.variant)
              ? row.variant[0] ?? null
              : row.variant;
            return (
              <ListRow
                key={row.id}
                columnsTemplate="1.5fr 0.6fr 0.8fr 0.6fr 1.4fr"
                className={styles.row}
              >
                <div className={styles.cellStack}>
                  <strong>{variant?.title ?? "Untitled variant"}</strong>
                  <span className={styles.meta}>
                    {variant?.sku ? variant.sku : "No SKU"}
                  </span>
                </div>
                <strong>v{row.version}</strong>
                <StatusBadge variant={getStatusVariant(row.status)}>{row.status}</StatusBadge>
                <span className={styles.meta}>{row.is_active ? "Yes" : "No"}</span>
                <div className={styles.actionCell}>
                  <form action={updateBomStatus} className={styles.inlineForm}>
                    <input type="hidden" name="bom_id" value={row.id} />
                    <select name="status" defaultValue={row.status}>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button type="submit">Update</button>
                  </form>
                  {!row.is_active && row.status !== "archived" ? (
                    <form action={setBomActive}>
                      <input type="hidden" name="bom_id" value={row.id} />
                      <button type="submit" className={styles.ghostBtn}>
                        Set active
                      </button>
                    </form>
                  ) : null}
                </div>
              </ListRow>
            );
          })
        )}
      </ListPanel>

      <ListPanel
        eyebrow="Lines"
        title="BOM component lines"
        description="Adjust per-unit component quantities without leaving the BOM workspace."
        columns={["BOM", "Component", "Qty / unit", "Actions"]}
        columnsTemplate="0.8fr 1.4fr 0.7fr 1.2fr"
      >
        {(bomLines ?? []).length === 0 ? (
          <EmptyState
            title="No BOM component lines yet"
            message="Add component lines to a BOM to define material requirements."
          />
        ) : (
          (bomLines as BomComponentRow[]).map((line) => {
            const bom = Array.isArray(line.product_bom)
              ? line.product_bom[0] ?? null
              : line.product_bom;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            return (
              <ListRow
                key={line.id}
                columnsTemplate="0.8fr 1.4fr 0.7fr 1.2fr"
                className={styles.row}
              >
                <strong>v{bom?.version ?? "?"}</strong>
                <div className={styles.cellStack}>
                  <strong>{component?.name ?? "Unknown"}</strong>
                  <span className={styles.meta}>
                    {component?.sku ? component.sku : "No SKU"}
                  </span>
                </div>
                <strong>{line.quantity}</strong>
                <form action={updateBomComponentQuantity} className={styles.inlineForm}>
                  <input type="hidden" name="line_id" value={line.id} />
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={line.quantity}
                  />
                  <button type="submit">Save</button>
                </form>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
