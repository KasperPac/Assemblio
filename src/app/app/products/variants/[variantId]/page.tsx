import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../../variant-detail.module.css";
import BomSeedPanel from "../../bom-seed-panel";
import BomEditor from "../../bom-editor";
import VariantTabs from "../../variant-tabs";
import {
  createBomLaborLine,
  deleteBomLaborLine,
  updateBomLaborLine,
} from "../../actions";

type VariantRecord = {
  id: string;
  title: string | null;
  sku: string | null;
  shopify_id: string;
  price: number | null;
  product:
    | {
        id: string;
        title: string;
      }
    | Array<{
        id: string;
        title: string;
      }>
    | null;
};

type BomRecord = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
};

type BomLineRecord = {
  id: string;
  product_bom_id: string;
  component_id: string;
  quantity: number;
  yield_pct: number;
  component:
    | {
        name: string | null;
        sku: string | null;
        unit: string | null;
        cost_per_unit: number | null;
      }
    | Array<{
        name: string | null;
        sku: string | null;
        unit: string | null;
        cost_per_unit: number | null;
      }>
    | null;
};

type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};

type LaborLineRecord = {
  id: string;
  product_bom_id: string;
  department_id: string;
  operation_name: string;
  sequence: number;
  setup_hours: number;
  run_hours_per_unit: number;
  admin_hours_per_unit: number;
  electricity_kwh_per_unit: number;
  gas_units_per_unit: number;
  notes: string | null;
  department:
    | {
        name: string | null;
        code: string | null;
      }
    | Array<{
        name: string | null;
        code: string | null;
      }>
    | null;
};

type SourceBomRecord = {
  id: string;
  version: number;
  status: string;
  variant:
    | {
        id: string;
        title: string | null;
        sku: string | null;
        product:
          | {
              title: string;
            }
          | Array<{
              title: string;
            }>
          | null;
      }
    | Array<{
        id: string;
        title: string | null;
        sku: string | null;
        product:
          | {
              title: string;
            }
          | Array<{
              title: string;
            }>
          | null;
      }>
    | null;
};

type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
};

type Props = {
  params: Promise<{
    variantId: string;
  }>;
  searchParams?: Promise<{
    laborSuccess?: string;
    laborError?: string;
  }>;
};

function classForStatus(status: string) {
  if (status === "active") return `${styles.badge} ${styles.badgeActive}`;
  if (status === "archived") return `${styles.badge} ${styles.badgeArchived}`;
  return `${styles.badge} ${styles.badgeDraft}`;
}

export default async function VariantDetailPage({ params, searchParams }: Props) {
  const { variantId } = await params;
  const query = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();

  const [{ data: variant }, { data: boms }, { data: sourceBoms }, { data: profile }, { data: templates }, { data: allComponents }, { data: departments }] =
    await Promise.all([
      supabase
        .from("shopify_variant")
        .select("id,title,sku,shopify_id,price,product:product_id(id,title)")
        .eq("id", variantId)
        .maybeSingle(),
      supabase
        .from("product_bom")
        .select("id,version,status,is_active,created_at")
        .eq("variant_id", variantId)
        .order("version", { ascending: false }),
      supabase
        .from("product_bom")
        .select("id,version,status,variant:variant_id(id,title,sku,product:product_id(title))")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase.from("profiles").select("role").single(),
      supabase
        .from("bom_template")
        .select("id,name,description,bom_template_line(id)")
        .order("name"),
      supabase
        .from("component")
        .select("id,name,sku,unit,group,cost_per_unit")
        .order("name"),
      supabase.from("department").select("id,name,code").eq("is_active", true).order("name"),
    ]);

  if (!variant) {
    notFound();
  }

  const typedVariant = variant as VariantRecord;
  const typedProduct = Array.isArray(typedVariant.product)
    ? typedVariant.product[0] ?? null
    : typedVariant.product;
  const typedBoms = (boms ?? []) as BomRecord[];
  const hasBom = typedBoms.length > 0;
  const canManageBom = ["admin", "super_admin"].includes(profile?.role ?? "member");
  const bomIds = typedBoms.map((bom) => bom.id);

  const { data: bomLines } =
    bomIds.length === 0
      ? { data: [] }
      : await supabase
          .from("product_bom_component")
          .select("id,product_bom_id,component_id,quantity,yield_pct,component:component_id(name,sku,unit,cost_per_unit)")
          .in("product_bom_id", bomIds)
          .order("created_at", { ascending: true });

  const { data: laborLines } =
    bomIds.length === 0
      ? { data: [] }
      : await supabase
          .from("product_bom_labor")
          .select(
            "id,product_bom_id,department_id,operation_name,sequence,setup_hours,run_hours_per_unit,admin_hours_per_unit,electricity_kwh_per_unit,gas_units_per_unit,notes,department:department_id(name,code)"
          )
          .in("product_bom_id", bomIds)
          .order("sequence", { ascending: true });

  const linesByBom = ((bomLines ?? []) as BomLineRecord[]).reduce<
    Record<string, BomLineRecord[]>
  >((acc, line) => {
    const bucket = acc[line.product_bom_id] ?? [];
    bucket.push(line);
    acc[line.product_bom_id] = bucket;
    return acc;
  }, {});

  const laborLinesByBom = ((laborLines ?? []) as LaborLineRecord[]).reduce<
    Record<string, LaborLineRecord[]>
  >((acc, line) => {
    const bucket = acc[line.product_bom_id] ?? [];
    bucket.push(line);
    acc[line.product_bom_id] = bucket;
    return acc;
  }, {});

  const templateOptions = (templates ?? []).map((t: { id: string; name: string; description: string | null; bom_template_line: Array<{ id: string }> | null }) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    lineCount: Array.isArray(t.bom_template_line) ? t.bom_template_line.length : 0,
  }));

  const copyOptions = ((sourceBoms ?? []) as SourceBomRecord[]).map((source) => {
    const sourceVariant = Array.isArray(source.variant)
      ? source.variant[0] ?? null
      : source.variant;
    const sourceProduct = Array.isArray(sourceVariant?.product)
      ? sourceVariant?.product[0] ?? null
      : sourceVariant?.product ?? null;

    return {
      id: source.id,
      label: `${sourceProduct?.title ?? "Product"} / ${sourceVariant?.title ?? "Variant"}${
        sourceVariant?.sku ? ` (${sourceVariant.sku})` : ""
      } - v${source.version} [${source.status}]`,
    };
  });

  const departmentOptions = (departments ?? []) as DepartmentOption[];

  // Determine the editor BOM: prefer latest draft, fall back to active BOM
  const editorBom =
    typedBoms.find((b) => b.status === "draft" && !b.is_active) ??
    typedBoms.find((b) => b.is_active) ??
    null;

  // Build the editor BOM with its lines in the shape BomEditor expects
  type EditorBomData = {
    id: string;
    version: number;
    status: string;
    is_active: boolean;
    created_at: string;
    lines: Array<{
      id: string;
      component_id: string;
      quantity: number;
      yield_pct: number;
      component: {
        name: string;
        sku: string | null;
        unit: string | null;
        cost_per_unit: number | null;
      };
    }>;
  };

  const editorBomWithLines: EditorBomData | null = editorBom
    ? {
        ...editorBom,
        lines: (linesByBom[editorBom.id] ?? []).map((line) => {
          const comp = Array.isArray(line.component)
            ? line.component[0] ?? null
            : line.component;
          return {
            id: line.id,
            component_id: line.component_id,
            quantity: line.quantity,
            yield_pct: line.yield_pct ?? 1,
            component: {
              name: comp?.name ?? "Unknown",
              sku: comp?.sku ?? null,
              unit: comp?.unit ?? null,
              cost_per_unit: comp?.cost_per_unit ?? null,
            },
          };
        }),
      }
    : null;

  // Compute labourCost from all labor lines on the editor BOM
  // (no hourly_rate in DB yet — show null so footer shows "—")
  const labourCost: number | null = null;

  const sellPrice =
    typedVariant.price !== null && typedVariant.price !== undefined
      ? Number(typedVariant.price)
      : null;

  const variantTitle = typedVariant.title ?? "Untitled variant";
  const typedAllComponents = (allComponents ?? []) as ComponentOption[];

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/app/products">Products</Link>
        {typedProduct?.id ? (
          <>
            {" / "}
            <Link href={`/app/products/${typedProduct.id}`}>{typedProduct.title}</Link>
          </>
        ) : null}
        {" / "}
        {variantTitle}
      </p>

      <section className={styles.card}>
        <h3>{variantTitle}</h3>
        <p className={styles.meta}>{typedVariant.sku ? `SKU ${typedVariant.sku}` : "No SKU"}</p>
        <p className={styles.meta}>Shopify ID: {typedVariant.shopify_id}</p>
      </section>

      <VariantTabs>
        {(activeTab) => (
          <>
            {/* ── Overview tab ───────────────────────── */}
            {activeTab === "overview" && (
              <div>
                <dl style={{ display: "grid", gap: "8px" }}>
                  <div>
                    <dt style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>Variant title</dt>
                    <dd style={{ fontSize: "15px", color: "#eee", marginTop: "2px" }}>{typedVariant.title ?? "—"}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>SKU</dt>
                    <dd style={{ fontSize: "15px", color: "#eee", marginTop: "2px" }}>{typedVariant.sku ?? "—"}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>Shopify ID</dt>
                    <dd style={{ fontSize: "15px", color: "#eee", marginTop: "2px" }}>{typedVariant.shopify_id}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>Price</dt>
                    <dd style={{ fontSize: "15px", color: "#eee", marginTop: "2px" }}>
                      {sellPrice !== null ? `$${sellPrice.toFixed(2)}` : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {/* ── Bill of Materials tab ──────────────── */}
            {activeTab === "bom" && (
              <>
                {query.laborSuccess ? (
                  <p className={styles.success}>{query.laborSuccess}</p>
                ) : null}
                {query.laborError ? (
                  <p className={styles.error}>{query.laborError}</p>
                ) : null}
                {hasBom && editorBomWithLines ? (
                  <BomEditor
                    bom={editorBomWithLines}
                    variantId={variantId}
                    variantLabel={variantTitle}
                    sellPrice={sellPrice}
                    labourCost={labourCost}
                    allComponents={typedAllComponents}
                    templates={templateOptions}
                    sourceBoms={copyOptions}
                  />
                ) : canManageBom ? (
                  <BomSeedPanel
                    targetVariantId={typedVariant.id}
                    variantLabel={variantTitle}
                    sourceBoms={copyOptions}
                    templates={templateOptions}
                    components={typedAllComponents}
                  />
                ) : (
                  <p className={styles.notice}>
                    No BOM exists for this variant. Only admin and super_admin can create or copy BOMs.
                  </p>
                )}
              </>
            )}

            {/* ── Labour & Routing tab ───────────────── */}
            {activeTab === "routing" && (
              <div className={styles.bomList}>
                {typedBoms.length === 0 ? (
                  <p className={styles.notice} style={{ fontStyle: "italic" }}>No routing yet.</p>
                ) : (
                  typedBoms.map((bom) => {
                    const laborRows = laborLinesByBom[bom.id] ?? [];
                    return (
                      <div key={bom.id} className={styles.lineTable}>
                        <div className={styles.bomHeader}>
                          <div className={styles.lineRow}>
                            <strong>Version {bom.version}</strong>
                            <div className={styles.badges}>
                              <span className={classForStatus(bom.status)}>{bom.status}</span>
                              {bom.is_active ? (
                                <span className={`${styles.badge} ${styles.badgeActive}`}>active</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className={styles.routingSection}>
                          <div className={styles.routingHeader}>
                            <strong>Labor routing</strong>
                            <span className={styles.meta}>
                              {laborRows.length} operation{laborRows.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className={styles.routingTable}>
                            <div className={styles.routingTableHeader}>
                              <span>Operation</span>
                              <span>Hours</span>
                              <span>Utilities</span>
                            </div>
                            {laborRows.length === 0 ? (
                              <div className={styles.routingRow}>
                                <span className={styles.empty}>No labor operations yet.</span>
                                <span />
                                <span />
                              </div>
                            ) : (
                              laborRows.map((line) => {
                                const department = Array.isArray(line.department)
                                  ? line.department[0] ?? null
                                  : line.department;

                                return (
                                  <form key={line.id} action={updateBomLaborLine} className={styles.routingEditor}>
                                    <input type="hidden" name="line_id" value={line.id} />
                                    <input type="hidden" name="variant_id" value={typedVariant.id} />
                                    <div className={styles.routingFormGrid}>
                                      <div className={styles.routingField}>
                                        <label>Operation</label>
                                        <input name="operation_name" defaultValue={line.operation_name} required />
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Department</label>
                                        <select name="department_id" defaultValue={line.department_id} required>
                                          {departmentOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {option.name} ({option.code})
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Sequence</label>
                                        <input name="sequence" type="number" min="1" step="1" defaultValue={line.sequence} />
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Setup hrs</label>
                                        <input name="setup_hours" type="number" min="0" step="0.25" defaultValue={line.setup_hours} />
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Run hrs / unit</label>
                                        <input name="run_hours_per_unit" type="number" min="0" step="0.25" defaultValue={line.run_hours_per_unit} />
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Admin hrs / unit</label>
                                        <input name="admin_hours_per_unit" type="number" min="0" step="0.25" defaultValue={line.admin_hours_per_unit} />
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Electricity kWh / unit</label>
                                        <input name="electricity_kwh_per_unit" type="number" min="0" step="0.01" defaultValue={line.electricity_kwh_per_unit} />
                                      </div>
                                      <div className={styles.routingField}>
                                        <label>Gas units / unit</label>
                                        <input name="gas_units_per_unit" type="number" min="0" step="0.01" defaultValue={line.gas_units_per_unit} />
                                      </div>
                                      <div className={`${styles.routingField} ${styles.routingSpanTwo}`}>
                                        <label>Notes</label>
                                        <input
                                          name="notes"
                                          defaultValue={line.notes ?? `${department?.name ?? "Department"} operation`}
                                        />
                                      </div>
                                      <div className={`${styles.routingActions} ${styles.routingSpanTwo}`}>
                                        <button className={styles.secondaryButton} type="submit">
                                          Save Operation
                                        </button>
                                        <button
                                          className={styles.secondaryButton}
                                          type="submit"
                                          formAction={deleteBomLaborLine}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  </form>
                                );
                              })
                            )}
                          </div>

                          {canManageBom ? (
                            <form action={createBomLaborLine} className={styles.routingCreateForm}>
                              <input type="hidden" name="product_bom_id" value={bom.id} />
                              <input type="hidden" name="variant_id" value={typedVariant.id} />
                              <div className={styles.routingFormGrid}>
                                <div className={styles.routingField}>
                                  <label>Operation</label>
                                  <input name="operation_name" placeholder="Assembly" required />
                                </div>
                                <div className={styles.routingField}>
                                  <label>Department</label>
                                  <select name="department_id" defaultValue="" required>
                                    <option value="" disabled>
                                      Select department
                                    </option>
                                    {departmentOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.name} ({option.code})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className={styles.routingField}>
                                  <label>Sequence</label>
                                  <input name="sequence" type="number" min="1" step="1" defaultValue="1" />
                                </div>
                                <div className={styles.routingField}>
                                  <label>Setup hrs</label>
                                  <input name="setup_hours" type="number" min="0" step="0.25" defaultValue="0" />
                                </div>
                                <div className={styles.routingField}>
                                  <label>Run hrs / unit</label>
                                  <input name="run_hours_per_unit" type="number" min="0" step="0.25" defaultValue="0" />
                                </div>
                                <div className={styles.routingField}>
                                  <label>Admin hrs / unit</label>
                                  <input name="admin_hours_per_unit" type="number" min="0" step="0.25" defaultValue="0" />
                                </div>
                                <div className={styles.routingField}>
                                  <label>Electricity kWh / unit</label>
                                  <input name="electricity_kwh_per_unit" type="number" min="0" step="0.01" defaultValue="0" />
                                </div>
                                <div className={styles.routingField}>
                                  <label>Gas units / unit</label>
                                  <input name="gas_units_per_unit" type="number" min="0" step="0.01" defaultValue="0" />
                                </div>
                                <div className={`${styles.routingField} ${styles.routingSpanTwo}`}>
                                  <label>Notes</label>
                                  <input name="notes" placeholder="Optional routing note" />
                                </div>
                                <div className={`${styles.routingActions} ${styles.routingSpanTwo}`}>
                                  <button className={styles.primaryButton} type="submit">
                                    Add Labor Operation
                                  </button>
                                </div>
                              </div>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Versions tab ────────────────────────── */}
            {activeTab === "versions" && (
              <div>
                <p style={{ color: "#555", fontStyle: "italic" }}>Version history — coming soon.</p>
              </div>
            )}
          </>
        )}
      </VariantTabs>
    </div>
  );
}
