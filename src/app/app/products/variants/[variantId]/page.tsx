import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { hasFeature } from "@/lib/plans/features";
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
  blocked_by: number[];
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
  const context = await getServerTenantContext();
  if (!context) notFound();
  const { supabase, tenantId } = context;

  const subscriptionAccess = await getSubscriptionAccess(supabase, tenantId);
  const canEditYield = subscriptionAccess.sub
    ? hasFeature(subscriptionAccess.sub, "advancedBom")
    : false;

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
      .from("product_variant")
      .select("id,title,sku,shopify_id,price,created_at,product:product_id(id,title)")
      .eq("id", variantId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("product_bom")
      .select("id,version,status,is_active,created_at")
      .eq("tenant_id", tenantId)
      .eq("variant_id", variantId)
      .order("version", { ascending: false }),
    supabase
      .from("product_bom")
      .select("id,version,status,variant:variant_id(id,title,sku,product:product_id(title))")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.from("profiles").select("role").single(),
    supabase
      .from("bom_template")
      .select("id,name,description,bom_template_line(id)")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("component")
      .select("id,name,sku,unit,cost_per_unit,group:group_id(name)")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase.from("department").select("id,name,code").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
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
            "id,product_bom_id,department_id,operation_name,sequence,blocked_by,setup_hours,run_hours_per_unit,admin_hours_per_unit,electricity_kwh_per_unit,gas_units_per_unit,notes,department:department_id(name,code)"
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

  const editorBomLaborLines = editorBom ? (laborLinesByBom[editorBom.id] ?? []) : [];
  const editorDepartmentIds = Array.from(
    new Set(editorBomLaborLines.map((line) => line.department_id))
  );

  type RateRow = {
    department_id: string;
    labor_rate_per_hour: number;
    admin_rate_per_hour: number;
    electricity_rate_per_kwh: number;
    gas_rate_per_unit: number;
    overhead_rate_per_hour: number;
    effective_from: string;
  };
  const { data: rateRowsData } =
    editorDepartmentIds.length === 0
      ? { data: [] }
      : await supabase
          .from("cost_rate_schedule")
          .select(
            "department_id,labor_rate_per_hour,admin_rate_per_hour,electricity_rate_per_kwh,gas_rate_per_unit,overhead_rate_per_hour,effective_from,effective_to,staff_member_id"
          )
          .eq("tenant_id", tenantId)
          .is("staff_member_id", null)
          .in("department_id", editorDepartmentIds)
          .lte("effective_from", new Date().toISOString().slice(0, 10))
          .order("effective_from", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  const ratesByDepartment = new Map<string, RateRow>();
  for (const row of (rateRowsData ?? []) as Array<RateRow & { effective_to: string | null }>) {
    if (row.effective_to !== null && row.effective_to < today) continue;
    if (!ratesByDepartment.has(row.department_id)) {
      ratesByDepartment.set(row.department_id, row);
    }
  }

  type PerOperationCost = {
    id: string;
    sequence: number;
    operationName: string;
    departmentName: string;
    labour: number;
    admin: number;
    electricity: number;
    gas: number;
    overhead: number;
    setupLabour: number;
    setupOverhead: number;
    hasRate: boolean;
  };

  const perOperation: PerOperationCost[] = editorBomLaborLines.map((line) => {
    const dept = Array.isArray(line.department) ? line.department[0] ?? null : line.department;
    const rate = ratesByDepartment.get(line.department_id);
    const labourRate = rate?.labor_rate_per_hour ?? 0;
    const adminRate = rate?.admin_rate_per_hour ?? 0;
    const elecRate = rate?.electricity_rate_per_kwh ?? 0;
    const gasRate = rate?.gas_rate_per_unit ?? 0;
    const overheadRate = rate?.overhead_rate_per_hour ?? 0;
    return {
      id: line.id,
      sequence: line.sequence,
      operationName: line.operation_name,
      departmentName: dept?.name ?? "Unknown",
      labour: line.run_hours_per_unit * labourRate,
      admin: line.admin_hours_per_unit * adminRate,
      electricity: line.electricity_kwh_per_unit * elecRate,
      gas: line.gas_units_per_unit * gasRate,
      overhead: line.run_hours_per_unit * overheadRate,
      setupLabour: line.setup_hours * labourRate,
      setupOverhead: line.setup_hours * overheadRate,
      hasRate: rate != null,
    };
  });

  const missingRateDepartments = Array.from(
    new Set(
      editorBomLaborLines
        .filter((line) => !ratesByDepartment.has(line.department_id))
        .map((line) => {
          const dept = Array.isArray(line.department) ? line.department[0] ?? null : line.department;
          return dept?.name ?? "Unknown";
        })
    )
  );

  const routingCosts = editorBomLaborLines.length === 0
    ? null
    : {
        labour: perOperation.reduce((sum, op) => sum + op.labour, 0),
        admin: perOperation.reduce((sum, op) => sum + op.admin, 0),
        electricity: perOperation.reduce((sum, op) => sum + op.electricity, 0),
        gas: perOperation.reduce((sum, op) => sum + op.gas, 0),
        overhead: perOperation.reduce((sum, op) => sum + op.overhead, 0),
        setupLabour: perOperation.reduce((sum, op) => sum + op.setupLabour, 0),
        setupOverhead: perOperation.reduce((sum, op) => sum + op.setupOverhead, 0),
        perOperation,
        missingRateDepartments,
      };

  const labourCost: number | null = routingCosts ? routingCosts.labour : null;
  const overheadCost: number | null = routingCosts
    ? routingCosts.admin + routingCosts.electricity + routingCosts.gas + routingCosts.overhead
    : null;
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
                overheadCost={overheadCost}
                routingCosts={routingCosts}
                allComponents={typedAllComponents}
                templates={templateOptions}
                sourceBoms={copyOptions}
                activeVersion={draftBom ? (activeBom?.version ?? null) : null}
                canEditYield={canEditYield}
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
                    const showCostSummary =
                      routingCosts !== null && editorBom?.id === bom.id;
                    const fmtAud = (value: number) =>
                      new Intl.NumberFormat("en-AU", {
                        style: "currency",
                        currency: "AUD",
                        maximumFractionDigits: 2,
                      }).format(value);

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
                        {showCostSummary ? (
                          <div className={styles.routingSection}>
                            <div className={styles.routingHeader}>
                              <strong>Cost per unit by operation</strong>
                              <span className={styles.meta}>
                                excl. setup · using current dept rates
                              </span>
                            </div>
                            {routingCosts!.missingRateDepartments.length > 0 ? (
                              <p className={styles.error}>
                                ⚠ No active cost-rate schedule for:{" "}
                                {routingCosts!.missingRateDepartments.join(", ")}. Set rates in
                                Settings · Costs to include them.
                              </p>
                            ) : null}
                            <div className={styles.costTable}>
                              <div className={styles.costTableHeader}>
                                <span>Operation</span>
                                <span>Labour</span>
                                <span>Admin</span>
                                <span>Electricity</span>
                                <span>Gas</span>
                                <span>Overhead</span>
                                <span>Total</span>
                              </div>
                              {routingCosts!.perOperation.map((op) => {
                                const total =
                                  op.labour + op.admin + op.electricity + op.gas + op.overhead;
                                return (
                                  <div key={op.id} className={styles.costTableRow}>
                                    <span>
                                      {op.sequence}. {op.operationName}
                                      <span className={styles.meta}> · {op.departmentName}</span>
                                      {!op.hasRate ? (
                                        <span className={styles.error}> · no rate</span>
                                      ) : null}
                                    </span>
                                    <span>{fmtAud(op.labour)}</span>
                                    <span>{fmtAud(op.admin)}</span>
                                    <span>{fmtAud(op.electricity)}</span>
                                    <span>{fmtAud(op.gas)}</span>
                                    <span>{fmtAud(op.overhead)}</span>
                                    <span>
                                      <strong>{fmtAud(total)}</strong>
                                    </span>
                                  </div>
                                );
                              })}
                              <div className={`${styles.costTableRow} ${styles.costTableTotals}`}>
                                <span>
                                  <strong>Total per unit</strong>
                                </span>
                                <span>{fmtAud(routingCosts!.labour)}</span>
                                <span>{fmtAud(routingCosts!.admin)}</span>
                                <span>{fmtAud(routingCosts!.electricity)}</span>
                                <span>{fmtAud(routingCosts!.gas)}</span>
                                <span>{fmtAud(routingCosts!.overhead)}</span>
                                <span>
                                  <strong>
                                    {fmtAud(
                                      routingCosts!.labour +
                                        routingCosts!.admin +
                                        routingCosts!.electricity +
                                        routingCosts!.gas +
                                        routingCosts!.overhead
                                    )}
                                  </strong>
                                </span>
                              </div>
                            </div>
                            {routingCosts!.setupLabour + routingCosts!.setupOverhead > 0 ? (
                              <p className={styles.meta}>
                                Setup (per batch):
                                {" "}labour {fmtAud(routingCosts!.setupLabour)} + overhead{" "}
                                {fmtAud(routingCosts!.setupOverhead)}. Not included in per-unit
                                totals; amortized over batch size on order snapshots.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
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
                                      {(() => {
                                        const otherRows = laborRows.filter((other) => other.id !== line.id);
                                        if (otherRows.length === 0) return null;
                                        return (
                                          <div className={`${styles.routingField} ${styles.routingSpanTwo}`}>
                                            <label>Depends on (must complete before this step starts)</label>
                                            <div className={styles.routingDepsWrapper}>
                                              {otherRows.map((other) => (
                                                <label key={other.id} className={styles.routingDepLabel}>
                                                  <input
                                                    type="checkbox"
                                                    name="blocked_by"
                                                    value={other.sequence.toString()}
                                                    defaultChecked={(line.blocked_by ?? []).includes(other.sequence)}
                                                  />
                                                  Step {other.sequence}: {other.operation_name}
                                                </label>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
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
