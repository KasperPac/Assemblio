import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import { CreateTemplateButton } from "./template-forms";
import {
  ComponentTemplateTable,
  LaborTemplateTable,
  type ComponentTemplateRowData,
  type LaborTemplateRowData,
} from "./template-table";
import { CreateLaborTemplateButton, type DepartmentOption } from "./labor-template-forms";
import { hasUnpublishedChanges, computeAffectedBoms, unwrap, type LinkedBomRow } from "./affected";
import styles from "./templates.module.css";

type TemplateLine = {
  id: string;
  template_id: string;
  quantity: number;
  component:
    | { id: string; name: string; sku: string | null; unit: string | null }
    | Array<{ id: string; name: string; sku: string | null; unit: string | null }>
    | null;
};

type ComponentTemplate = {
  id: string;
  name: string;
  description: string | null;
  is_linked: boolean;
  lines_updated_at: string | null;
  last_published_at: string | null;
  created_at: string;
};

type LaborTemplate = {
  id: string;
  name: string;
  description: string | null;
  mode: "basic" | "advanced";
  is_linked: boolean;
  lines_updated_at: string | null;
  last_published_at: string | null;
  created_at: string;
};

type LaborTemplateLine = {
  id: string;
  template_id: string;
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
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
};

type Props = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function TemplatesPage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const params = (await searchParams) ?? {};
  const tab = params.tab === "labor" ? "labor" : "components";

  const [
    { data: templates },
    { data: templateLines },
    { data: components },
    { data: linkedBoms },
    { data: laborTemplatesRaw },
    { data: laborTemplateLinesRaw },
    { data: departmentsRaw },
  ] = await Promise.all([
    supabase
      .from("bom_template")
      .select("id,name,description,is_linked,lines_updated_at,last_published_at,created_at")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("bom_template_line")
      .select("id,template_id,quantity,component:component_id(id,name,sku,unit)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("component")
      .select("id,name,sku,unit,cost_per_unit,description,group:group_id(name)")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("product_bom")
      .select(
        "id,variant_id,version,status,component_template_id,labor_template_id,variant:variant_id(id,title,sku)"
      )
      .eq("tenant_id", tenantId)
      .or("component_template_id.not.is.null,labor_template_id.not.is.null"),
    supabase
      .from("labor_template")
      .select("id,name,description,mode,is_linked,lines_updated_at,last_published_at,created_at")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("labor_template_line")
      .select(
        "id,template_id,department_id,operation_name,sequence,setup_hours,run_hours_per_unit,admin_hours_per_unit,electricity_kwh_per_unit,gas_units_per_unit,notes,department:department_id(id,name)"
      )
      .eq("tenant_id", tenantId)
      .order("sequence", { ascending: true }),
    supabase
      .from("department")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const typedTemplates = (templates ?? []) as ComponentTemplate[];
  const typedLinkedBoms = (linkedBoms ?? []) as LinkedBomRow[];
  const laborTemplates = (laborTemplatesRaw ?? []) as LaborTemplate[];
  const laborTemplateLines = (laborTemplateLinesRaw ?? []) as LaborTemplateLine[];
  const departmentOptions = (departmentsRaw ?? []) as DepartmentOption[];

  const linesByTemplate = ((templateLines ?? []) as TemplateLine[]).reduce<
    Record<string, TemplateLine[]>
  >((acc, line) => {
    (acc[line.template_id] ??= []).push(line);
    return acc;
  }, {});

  const laborLinesByTemplate = laborTemplateLines.reduce<
    Record<string, LaborTemplateLine[]>
  >((acc, line) => {
    (acc[line.template_id] ??= []).push(line);
    return acc;
  }, {});

  const componentOptions = (components ?? []).map((c) => {
    const rawGroup = Array.isArray(c.group) ? c.group[0] : c.group;
    return {
      id: c.id as string,
      name: c.name as string,
      sku: (c.sku as string | null) ?? null,
      unit: (c.unit as string | null) ?? null,
      cost_per_unit: (c.cost_per_unit as number | null) ?? null,
      description: (c.description as string | null) ?? null,
      group: (rawGroup as { name: string } | null)?.name ?? null,
    };
  });

  const componentRows: ComponentTemplateRowData[] = typedTemplates.map((template) => {
    const lines = linesByTemplate[template.id] ?? [];
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      isLinked: template.is_linked,
      hasUnpublished: hasUnpublishedChanges(template),
      affected: computeAffectedBoms(typedLinkedBoms, "component_template_id", template.id),
      lines: lines.map((line) => {
        const comp = unwrap(line.component);
        return {
          id: line.id,
          componentId: comp?.id ?? "",
          componentName: comp?.name ?? "Unknown",
          sku: comp?.sku ?? null,
          unit: comp?.unit ?? null,
          quantity: line.quantity,
        };
      }),
    };
  });

  const laborRows: LaborTemplateRowData[] = laborTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    mode: t.mode,
    isLinked: t.is_linked,
    hasUnpublished: hasUnpublishedChanges(t),
    affected: computeAffectedBoms(typedLinkedBoms, "labor_template_id", t.id),
    lines: (laborLinesByTemplate[t.id] ?? []).map((line) => ({
      department_id: line.department_id,
      operation_name: line.operation_name,
      sequence: line.sequence,
      setup_hours: line.setup_hours,
      run_hours_per_unit: line.run_hours_per_unit,
      admin_hours_per_unit: line.admin_hours_per_unit,
      electricity_kwh_per_unit: line.electricity_kwh_per_unit,
      gas_units_per_unit: line.gas_units_per_unit,
      notes: line.notes,
    })),
  }));

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Products"
        title="Templates"
        description="Reusable component packs and labor routings for BOMs."
        actions={
          tab === "components" ? <CreateTemplateButton /> : <CreateLaborTemplateButton />
        }
      />

      <div className={styles.tabBar}>
        <Link
          href="/app/templates?tab=components"
          className={tab === "components" ? styles.tabActive : styles.tab}
        >
          Components ({typedTemplates.length})
        </Link>
        <Link
          href="/app/templates?tab=labor"
          className={tab === "labor" ? styles.tabActive : styles.tab}
        >
          Labor &amp; Routing ({laborTemplates.length})
        </Link>
      </div>

      {tab === "labor" ? (
        laborTemplates.length === 0 ? (
          <EmptyState
            title="No labor templates yet"
            message="Create a labor template to define reusable routing operations for BOMs."
          />
        ) : (
          <LaborTemplateTable templates={laborRows} departments={departmentOptions} />
        )
      ) : typedTemplates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          message="Create a component template to start reusing common material packs."
        />
      ) : (
        <ComponentTemplateTable templates={componentRows} components={componentOptions} />
      )}
    </div>
  );
}
