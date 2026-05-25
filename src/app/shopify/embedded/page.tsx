import { isValidShopDomain, normalizeShopDomain } from "@/lib/shopify/auth";
import EmbeddedClient from "./embedded-client";
import styles from "./embedded.module.css";

type SearchParams = Promise<{ shop?: string; host?: string }>;

export default async function EmbeddedPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const shopRaw = sp.shop ?? "";
  const host = sp.host ?? "";
  const shop = normalizeShopDomain(shopRaw);

  if (!isValidShopDomain(shop) || !host) {
    return (
      <main className={styles.frame}>
        <section className={styles.card}>
          <h1 className={styles.title}>Open from Shopify Admin</h1>
          <p className={styles.body}>
            This page is only accessible when launched from inside the Shopify Admin.
            Open your store, click <strong>Apps &rarr; Manuva</strong> and we&apos;ll load here.
          </p>
          <a className={styles.linkOut} href="https://manuva.app">
            Learn more about Manuva &rarr;
          </a>
        </section>
      </main>
    );
  }

  return <EmbeddedClient shop={shop} />;
}
