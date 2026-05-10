"use client";

import { useState } from "react";
import styles from "./integrations.module.css";

export default function ShopifyConnect() {
  const [shop, setShop] = useState("");

  return (
    <div className={styles.shopifyCard}>
      <div>
        <h3>Shopify Connection</h3>
        <p>Connect a store to enable product and order sync.</p>
      </div>
      <form className={styles.shopifyForm} action="/api/shopify/auth" method="get">
        <input
          name="shop"
          placeholder="your-store.myshopify.com"
          value={shop}
          onChange={(event) => setShop(event.target.value)}
          required
        />
        <button type="submit">Connect Shopify</button>
      </form>
    </div>
  );
}
