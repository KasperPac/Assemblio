import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/app/app/_ui/page-header";
import StatusBadge from "@/app/app/_ui/status-badge";
import proseStyles from "@/components/help/prose.module.css";
import { MANUAL_CONTENT } from "@/content/help/content";
import { MANUALS, findManual } from "@/content/help/manuals";
import { getManualHeadings } from "@/lib/help/load";
import { helpBaseUrl } from "@/lib/help/urls";
import styles from "../help.module.css";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return MANUALS.map((m) => ({ manual: m.slug }));
}

type Props = { params: Promise<{ manual: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { manual } = await params;
  const m = findManual(manual);
  if (!m) return {};
  const url = `${helpBaseUrl()}/help/${m.slug}`;
  const title = `${m.title} | Manuva help`;
  return {
    title,
    description: m.description,
    alternates: { canonical: url },
    openGraph: { title, description: m.description, url, siteName: "Manuva", type: "article" },
  };
}

export default async function ManualPage({ params }: Props) {
  const { manual } = await params;
  const m = findManual(manual);
  const load = m ? MANUAL_CONTENT[m.slug] : undefined;
  if (!m || !load) notFound();
  const { default: Content } = await load();
  const headings = getManualHeadings(m.slug);

  return (
    <article className={styles.page}>
      <PageHeader
        breadcrumbs={[{ label: "Help", href: "/help" }, { label: m.title }]}
        title={m.title}
        description={m.description}
        actions={m.planGated ? <StatusBadge variant="info">Plan feature</StatusBadge> : undefined}
      />
      {headings.length > 0 ? (
        <nav className={styles.contents} aria-label="On this page">
          <p className={styles.contentsLabel}>On this page</p>
          <ol className={styles.contentsList}>
            {headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className={proseStyles.prose}>
        <Content />
      </div>
    </article>
  );
}
