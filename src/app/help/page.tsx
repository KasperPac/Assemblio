import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/app/app/_ui/page-header";
import StatusBadge from "@/app/app/_ui/status-badge";
import { MANUALS } from "@/content/help/manuals";
import { getSearchSources } from "@/lib/help/load";
import { buildSearchIndex } from "@/lib/help/search";
import { helpBaseUrl } from "@/lib/help/urls";
import HelpSearch from "./help-search";
import styles from "./help.module.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help centre | Manuva",
  description: "Manuals for every part of Manuva: products, inventory, orders, purchasing, Xero, production planning and more.",
  alternates: { canonical: `${helpBaseUrl()}/help` },
};

export default function HelpIndexPage() {
  const entries = buildSearchIndex(getSearchSources());
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Help"
        title="Manuva help centre"
        description="One manual for each part of Manuva, written from how the app works today."
      />
      <HelpSearch entries={entries} />
      <ul className={styles.cards}>
        {MANUALS.map((m) => (
          <li key={m.slug}>
            <Link href={`/help/${m.slug}`} className={styles.card}>
              <span className={styles.cardTitle}>
                {m.title}
                {m.planGated ? <StatusBadge variant="info">Plan feature</StatusBadge> : null}
              </span>
              <span className={styles.cardDesc}>{m.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
