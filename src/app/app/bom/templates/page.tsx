import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  CreateTemplateButton,
  AddLineForm,
  RemoveLineButton,
  DeleteTemplateButton,
} from "./template-forms";
import PageHeader from "../../_ui/page-header";
import EmptyState from "../../_ui/empty-state";
import styles from "./templates.module.css";

type TemplateLine = {
  id: string;
  quantity: number;
  component:
    | { name: string; sku: string | null; unit: string | null }
    | Array<{ name: string; sku: string | null; unit: string | null }>
    | null;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

function unwrap<T>(val: T | T[] | null): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

export default async function TemplatesPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const [{ data: templates }, { data: templateLines }, { data: components }] =
    await Promise.all([
      supabase.from("bom_template").select("id,name,description,created_at").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("bom_template_line")
        .select("id,template_id,quantity,component:component_id(name,sku,unit)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      supabase.from("component").select("id,name,sku").eq("tenant_id", tenantId).order("name"),
    ]);

  const typedTemplates = (templates ?? []) as Template[];
  const linesByTemplate = ((templateLines ?? []) as (TemplateLine & { template_id: string })[]).reduce<
    Record<string, (TemplateLine & { template_id: string })[]>
  >((acc, line) => {
    const bucket = acc[line.template_id] ?? [];
    bucket.push(line);
    acc[line.template_id] = bucket;
    return acc;
  }, {});

  const componentOptions = (components ?? []) as Array<{
    id: string;
    name: string;
    sku: string | null;
  }>;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="BOM templates"
        title="Reusable material packs"
        description={`${typedTemplates.length} template${typedTemplates.length !== 1 ? "s" : ""} available for repeatable BOM composition.`}
        actions={<CreateTemplateButton />}
      />

      <p className={styles.breadcrumb}>
        <Link href="/app/bom">BOM</Link> &gt; Templates
      </p>

      {typedTemplates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          message="Create a BOM template to start reusing common material packs."
        />
      ) : (
        typedTemplates.map((template) => {
          const lines = linesByTemplate[template.id] ?? [];
          return (
            <section key={template.id} className={styles.templateCard}>
              <div className={styles.templateTop}>
                <div className={styles.templateInfo}>
                  <div className={styles.templateNameRow}>
                    <h2>{template.name}</h2>
                    <span className={styles.lineCountBadge}>{lines.length} items</span>
                  </div>
                  {template.description ? (
                    <p className={styles.templateDesc}>{template.description}</p>
                  ) : null}
                </div>
                <DeleteTemplateButton templateId={template.id} />
              </div>

              {lines.length > 0 ? (
                <div className={styles.lineList}>
                  {lines.map((line) => {
                    const comp = unwrap(line.component);
                    return (
                      <div key={line.id} className={styles.lineRow}>
                        <div className={styles.lineIdentity}>
                          <strong>{comp?.name ?? "Unknown"}</strong>
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
                          <RemoveLineButton lineId={line.id} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyLines}>No template lines yet.</div>
              )}

              <div className={styles.addLineWrap}>
                <AddLineForm templateId={template.id} components={componentOptions} />
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
