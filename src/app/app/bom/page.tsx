import styles from "./bom.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import BomCreateForm from "./bom-create-form";
import BomComponentLineForm from "./bom-component-line-form";
import {
  createBom,
  createBomComponentLine,
  setBomActive,
  updateBomComponentQuantity,
  updateBomStatus,
} from "./actions";

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

export default async function BomPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: variants }, { data: components }, { data: bomLines }] =
    await Promise.all([
    supabase
      .from("product_bom")
      .select("id,version,status,is_active,variant:variant_id(title,sku)")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("shopify_variant").select("id,title,sku").order("title"),
    supabase.from("component").select("id,name,sku").order("name"),
    supabase
      .from("product_bom_component")
      .select("id,quantity,product_bom:product_bom_id(id,version),component:component_id(name,sku)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>BOM Management</h1>
          <p>Versioned bills of materials per Shopify variant.</p>
        </div>
      </div>
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
          ((components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>).map((c) => ({
            id: c.id,
            label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
          }))
        }
        action={createBomComponentLine}
      />
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Variant</span>
          <span>Version</span>
          <span>Status</span>
          <span>Active</span>
          <span>Actions</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load BOMs.</div>
        ) : (data ?? []).length === 0 ? (
          <div className={styles.empty}>No BOMs yet.</div>
        ) : (
          (data as BomRow[]).map((row) => {
            const variant = Array.isArray(row.variant)
              ? row.variant[0] ?? null
              : row.variant;
            return (
              <div key={row.id} className={styles.tableRow}>
                <span>
                  {variant?.title ?? "Untitled variant"}
                  {variant?.sku ? ` (${variant.sku})` : ""}
                </span>
                <span>v{row.version}</span>
                <span className={styles.status}>{row.status}</span>
                <span>{row.is_active ? "Yes" : "No"}</span>
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
                        Set Active
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className={styles.table}>
        <div className={styles.tableHeaderLines}>
          <span>BOM</span>
          <span>Component</span>
          <span>Qty / unit</span>
          <span>Actions</span>
        </div>
        {(bomLines ?? []).length === 0 ? (
          <div className={styles.empty}>No BOM component lines yet.</div>
        ) : (
          (bomLines as BomComponentRow[]).map((line) => {
            const bom = Array.isArray(line.product_bom)
              ? line.product_bom[0] ?? null
              : line.product_bom;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            return (
              <div key={line.id} className={styles.tableRowLines}>
                <span>v{bom?.version ?? "?"}</span>
                <span>
                  {component?.name ?? "Unknown"}
                  {component?.sku ? ` (${component.sku})` : ""}
                </span>
                <span>{line.quantity}</span>
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
