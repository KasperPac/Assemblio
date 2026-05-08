import { Suspense } from "react";
import PageHeader from "@/app/app/_ui/page-header";
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

export function ReportShell({
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

  return (
    <div className={styles.shell}>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Suspense fallback={null}>
        <DatePresetBar csvHref={csvHref} hideDateRange={hideDateRange} />
      </Suspense>
      {children}
    </div>
  );
}
