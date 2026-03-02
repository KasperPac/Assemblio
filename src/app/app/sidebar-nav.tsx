"use client";

import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

const navItems = [
  { label: "Dashboard", href: "/app" },
  { label: "Products", href: "/app/products" },
  { label: "Components", href: "/app/components" },
  { label: "Goods Inwards", href: "/app/goods-inwards" },
  { label: "Orders", href: "/app/orders" },
  { label: "Stocktake", href: "/app/stocktake" },
  { label: "Reports", href: "/app/reports" },
  { label: "Suppliers", href: "/app/suppliers" },
  { label: "Activity Log", href: "/app/activity-log" },
  { label: "Settings", href: "/app/settings" },
  { label: "Trash", href: "/app/trash" },
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => {
        const isActive =
          item.href === "/app"
            ? pathname === "/app"
            : pathname?.startsWith(item.href);

        return (
          <a
            key={item.href}
            href={item.href}
            className={isActive ? styles.active : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
