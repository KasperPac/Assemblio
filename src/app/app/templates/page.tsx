import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import {
  CreateTemplateButton,
  RemoveLineButton,
  DeleteTemplateButton,
  TemplateLightbox,
} from "./template-forms";
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
  ]);

  const typedTemplates = (templates ?? []) as ComponentTemplate[];
  const typedLinkedBoms = (linkedBoms ?? []) as LinkedBomRow[];

  const linesByTemplate = ((templateLines ?? []) as TemplateLine[]).reduce<
    Record<string, TemplateLine[]>
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

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Products"
        title="Templates"
        description="Reusable component packs and labor routings for BOMs."
        actions={tab === "components" ? <CreateTemplateButton /> : null}
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
          Labor &amp; Routing (0)
        </Link>
      </div>

      {tab === "labor" ? (
        <EmptyState
          title="No labor templates yet"
          message="Labor & routing templates arrive in the next step."
        />
      ) : typedTemplates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          message="Create a component template to start reusing common material packs."
        />
      ) : (
        typedTemplates.map((template) => {
          const lines = linesByTemplate[template.id] ?? [];
          const affected = computeAffectedBoms(
            typedLinkedBoms,
            "component_template_id",
            template.id
          );
          const dirty = hasUnpublishedChanges(template);
          return (
            <section key={template.id} className={styles.templateCard}>
              <div className={styles.templateTop}>
                <div className={styles.templateInfo}>
                  <div className={styles.templateNameRow}>
                    <h2>{template.name}</h2>
                    <span className={styles.lineCountBadge}>{lines.length} items</span>
                    <span className={template.is_linked ? styles.badgeLinked : styles.badgeUnlinked}>
                      {template.is_linked ? "Linked" : "Not linked"}
                    </span>
                    {dirty ? <span className={styles.badgeDirty}>Unpublished changes</span> : null}
                  </div>
                  {template.description ? (
                    <p className={styles.templateDesc}>{template.description}</p>
                  ) : null}
                </div>
              </div>

              {lines.length > 0 ? (
                <div className={styles.lineList}>
                  {lines.map((line) => {
                    const comp = unwrap(line.component);
                    return (
                      <div key={line.id} className={styles.lineRow}>
                        <div className={styles.lineIdentity}>
                          {comp?.id ? (
                            <Link href={`/app/components/${comp.id}`} className={styles.componentLink}>
                              {comp?.name ?? "Unknown"}
                            </Link>
                          ) : (
                            <strong>{comp?.name ?? "Unknown"}</strong>
                          )}
                          <span>{comp?.sku ?? "--"}</span>
                        </div>
                        <div className={styles.lineMeta}>
                          <span>Qty</span>
                          <strong>{line.quantity}</strong>
                        </div>
                        <div className={styles.lineMeta}>
                          <span>Unit</span>
                          <strong>{comp?.unit ?? "ea"}</strong>
                        </div>
                        <span className={styles.lineAction}>
                          <RemoveLineButton lineId={line.id} templateId={template.id} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyLines}>No template lines yet.</div>
              )}

              <div className={styles.cardFooter}>
                <TemplateLightbox
                  templateId={template.id}
                  templateName={template.name}
                  existingLines={lines.map((line) => {
                    const comp = unwrap(line.component);
                    return { component_id: comp?.id ?? "", quantity: line.quantity };
                  })}
                  components={componentOptions}
                />
                {/* Link controls (toggle + tooltip + publish) added in Task 6 */}
                <span className={styles.usedBy}>
                  {affected.length > 0
                    ? `Used by ${affected.length} BOM${affected.length === 1 ? "" : "s"}`
                    : "Not used yet"}
                </span>
                <DeleteTemplateButton templateId={template.id} usedByCount={affected.length} />
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
