import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../../variant-detail.module.css";
import BomSeedPanel from "../../bom-seed-panel";
import BomEditor from "../../bom-editor";
import BomVersionsTab from "../../bom-versions-tab";
import VariantTabs, { type Tab } from "../../variant-tabs";
import NotificationsTab from "./notifications-tab";
import {
  createBomLaborLine,
  deleteBomLaborLine,
  updateBomLaborLine,
  upsertNotificationTrigger,
  removeNotificationTrigger,
} from "../../actions";

type VariantRecord = {
  id: string;
  title: string | null;
  sku: string | null;
  shopify_id: string;
  price: number | null;
  created_at: string;
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
    tab?: string;
    notifSuccess?: string;
    notifError?: string;
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

  const [
    { data: variant },
    { data: boms },
    { data: sourceBoms },
    { data: profile },
    { data: templates },
    { data: allComponents },
    { data: departments },
  ] = await Promise.all([
    supabase
      .from("shopify_variant")
      .select("id,title,sku,shopify_id,price,created_at,product:product_id(id,title)")
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
      .select("id,name,sku,unit,cost_per_unit,group:group_id(name)")
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

  const linesByBom = ((bomLines ?? []) as BomLineRecord[]).reduce<Record<string, BomLineRecord[]>>(
    (acc, line) => {
      const bucket = acc[line.product_bom_id] ?? [];
      bucket.push(line);
      acc[line.product_bom_id] = bucket;
      return acc;
    },
    {}
  );

  const laborLinesByBom = ((laborLines ?? []) as LaborLineRecord[]).reduce<Record<string, LaborLineRecord[]>>(
    (acc, line) => {
      const bucket = acc[line.product_bom_id] ?? [];
      bucket.push(line);
      acc[line.product_bom_id] = bucket;
      return acc;
    },
    {}
  );

  const activeBomId = typedBoms.find((bom) => bom.is_active)?.id ?? null;

  const { data: notifTriggers } = activeBomId
    ? await supabase
        .from("product_notification_trigger")
        .select("id, routing_sequence, message_template, channel")
        .eq("product_bom_id", activeBomId)
    : { data: [] };

  const templateOptions = (templates ?? []).map(
    (template: {
      id: string;
      name: string;
      description: string | null;
      bom_template_line: Array<{ id: string }> | null;
    }) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      lineCount: Array.isArray(template.bom_template_line) ? template.bom_template_line.length : 0,
    })
  );

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

  const activeBom = typedBoms.find((bom) => bom.is_active) ?? null;
  const draftBom = typedBoms.find((bom) => !bom.is_active && bom.status === "draft") ?? null;
  // Show active BOM by default; show draft when one exists (user is mid-edit)
  const editorBom = draftBom ?? activeBom;

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
          const component = Array.isArray(line.component)
            ? line.component[0] ?? null
            : line.component;

          return {
            id: line.id,
            component_id: line.component_id,
            quantity: line.quantity,
            yield_pct: line.yield_pct ?? 1,
            component: {
              name: component?.name ?? "Unknown",
              sku: component?.sku ?? null,
              unit: component?.unit ?? null,
              cost_per_unit: component?.cost_per_unit ?? null,
            },
          };
        }),
      }
    : null;

  // Exclude in-progress drafts from the history tab; old active BOMs have status "active" and is_active false
  const savedBoms = typedBoms.filter((bom) => bom.status !== "draft");
  const allBomsWithLines = savedBoms.map((bom) => ({
    ...bom,
    lines: (linesByBom[bom.id] ?? []).map((line) => {
      const component = Array.isArray(line.component)
        ? line.component[0] ?? null
        : line.component;
      return {
        id: line.id,
        component_id: line.component_id,
        quantity: line.quantity,
        yield_pct: line.yield_pct ?? 1,
        component: component
          ? {
              name: component.name ?? "Unknown",
              sku: component.sku ?? null,
              unit: component.unit ?? null,
              cost_per_unit: component.cost_per_unit ?? null,
            }
          : null,
      };
    }),
  }));

  const labourCost: number | null = null;
  const sellPrice =
    typedVariant.price !== null && typedVariant.price !== undefined
      ? Number(typedVariant.price)
      : null;

  const variantTitle = typedVariant.title ?? "Untitled variant";
  const typedAllComponents: ComponentOption[] = (allComponents ?? []).map((c) => {
    const rawGroup = Array.isArray(c.group) ? c.group[0] : c.group;
    return {
      id: c.id as string,
      name: c.name as string,
      sku: (c.sku as string | null) ?? null,
      unit: (c.unit as string | null) ?? null,
      cost_per_unit: (c.cost_per_unit as number | null) ?? null,
      group: (rawGroup as { name: string } | null)?.name ?? null,
    };
  });
  const requestedTab = query.tab;
  const defaultTab: Tab =
    requestedTab === "overview" ||
    requestedTab === "bom" ||
    requestedTab === "routing" ||
    requestedTab === "versions" ||
    requestedTab === "notifications"
      ? requestedTab
      : query.laborSuccess || query.laborError
        ? "routing"
        : query.notifSuccess || query.notifError
          ? "notifications"
          : "bom";

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

      <VariantTabs
        defaultTab={defaultTab}
        overview={
          <div>
            <dl style={{ display: "grid", gap: "8px" }}>
              <div>
                <dt className={styles.overviewLabel}>Variant title</dt>
                <dd className={styles.overviewValue}>{typedVariant.title ?? "—"}</dd>
              </div>
              <div>
                <dt className={styles.overviewLabel}>SKU</dt>
                <dd className={styles.overviewValue}>{typedVariant.sku ?? "—"}</dd>
              </div>
              <div>
                <dt className={styles.overviewLabel}>Shopify ID</dt>
                <dd className={styles.overviewValue}>{typedVariant.shopify_id}</dd>
              </div>
              <div>
                <dt className={styles.overviewLabel}>Price</dt>
                <dd className={styles.overviewValue}>
                  {sellPrice !== null ? `$${sellPrice.toFixed(2)}` : "—"}
                </dd>
              </div>
              <div>
                <dt className={styles.overviewLabel}>Created</dt>
                <dd className={styles.overviewValue}>
                  {new Date(typedVariant.created_at).toLocaleDateString("en-AU")}
                </dd>
              </div>
            </dl>
          </div>
        }
        bom={
          <>
            {query.laborSuccess ? <p className={styles.success}>{query.laborSuccess}</p> : null}
            {query.laborError ? <p className={styles.error}>{query.laborError}</p> : null}
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
                activeVersion={draftBom ? (activeBom?.version ?? null) : null}
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
        }
        routing={
              <div className={styles.bomList}>
                {typedBoms.length === 0 ? (
                  <p className={styles.notice} style={{ fontStyle: "italic" }}>
                    No routing yet.
                  </p>
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
        }
        versions={
          <BomVersionsTab
            boms={allBomsWithLines}
            variantId={variant.id}
            sellPrice={sellPrice}
          />
        }
        notifications={
          <NotificationsTab
            activeBomId={activeBomId}
            laborLines={(activeBomId ? (laborLinesByBom[activeBomId] ?? []) : []).map((line) => {
              const dept = Array.isArray(line.department) ? line.department[0] ?? null : line.department;
              return {
                id: line.id,
                sequence: line.sequence,
                operationName: line.operation_name,
                departmentName: dept?.name ?? "Unknown",
              };
            })}
            existingTriggers={(notifTriggers ?? []).map((t) => ({
              routingSequence: t.routing_sequence,
              messageTemplate: t.message_template,
            }))}
            variantId={typedVariant.id}
            canManage={canManageBom}
            upsertAction={upsertNotificationTrigger}
            removeAction={removeNotificationTrigger}
            successMessage={query.notifSuccess}
            errorMessage={query.notifError}
          />
        }
      />
    </div>
  );
}
