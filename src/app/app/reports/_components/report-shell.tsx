import { Suspense } from "react";
import PageHeader from "@/app/app/_ui/page-header";
import { getServerTenantContext } from "@/lib/tenant/context";
import { rangeLabel } from "../_lib/print";
import { DatePresetBar } from "./date-preset-bar";
import styles from "./report-shell.module.css";

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  csvSlug: string;
  searchParams: Record<string, string | string[] | undefined>;
  hideDateRange?: boolean;
  children: React.ReactNode;
}

export async function ReportShell({
  eyebrow,
  title,
  description,
  csvSlug,
  searchParams,
  hideDateRange,
  children,
}: Props) {
  const sp = new URLSearchParams();
  if (typeof searchParams.from === "string") sp.set("from", searchParams.from);
  if (typeof searchParams.to === "string") sp.set("to", searchParams.to);
  const csvHref = `/app/reports/${csvSlug}/export?${sp.toString()}`;

  // Printed header only — the screen shows the workspace in the topbar,
  // which is hidden in print.
  const ctx = await getServerTenantContext();
  let workspace = "";
  if (ctx?.tenantId) {
    const { data } = await ctx.supabase
      .from("tenant")
      .select("name")
      .eq("id", ctx.tenantId)
      .maybeSingle();
    workspace = data?.name ?? "";
  }
  const range = hideDateRange
    ? null
    : rangeLabel({
        from: typeof searchParams.from === "string" ? searchParams.from : undefined,
        to: typeof searchParams.to === "string" ? searchParams.to : undefined,
      });

  const refreshed = new Date().toLocaleString("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className={styles.shell}>
      <header className={styles.printHeader} aria-hidden="true">
        <div className={styles.printBrand}>Manuva</div>
        <div className={styles.printMeta}>
          {workspace ? <span>{workspace}</span> : null}
          <span>{title}</span>
          {range ? <span>{range}</span> : null}
          <span>Generated {refreshed}</span>
        </div>
      </header>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        breadcrumbs={[{ label: "Reports", href: "/app/reports" }, { label: title }]}
      />
      <Suspense fallback={null}>
        <DatePresetBar csvHref={csvHref} hideDateRange={hideDateRange} />
      </Suspense>
      <p className={styles.refreshed}>as of {refreshed}</p>
      {children}
    </div>
  );
}
