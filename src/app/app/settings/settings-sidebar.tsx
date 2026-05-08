"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./settings-layout.module.css";

const personalLinks = [
  { href: "/app/settings/profile", label: "Profile" },
  { href: "/app/settings/appearance", label: "Appearance" },
];

const workspaceLinks = [
  { href: "/app/settings/company", label: "Company" },
  { href: "/app/settings/team", label: "Team" },
  { href: "/app/settings/integrations", label: "Integrations" },
  { href: "/app/settings/locations", label: "Locations" },
  { href: "/app/settings/invoices", label: "Invoices" },
];

export default function SettingsSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar}>
      <p className={styles.sidebarGroup}>Personal</p>
      <ul className={styles.navList}>
        {personalLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`${styles.navLink} ${
                pathname === link.href || pathname.startsWith(link.href + "/") ? styles.navLinkActive : ""
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <>
          <p className={styles.sidebarGroup}>Workspace</p>
          <ul className={styles.navList}>
            {workspaceLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`${styles.navLink} ${
                    pathname === link.href || pathname.startsWith(link.href + "/") ? styles.navLinkActive : ""
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
