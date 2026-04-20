"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getRouteMeta } from "./route-meta";
import styles from "./shell.module.css";

type Props = {
  tenantName: string;
  userInitial: string;
};

export default function Topbar({ tenantName, userInitial }: Props) {
  const pathname = usePathname();
  const meta = getRouteMeta(pathname);
  const showBreadcrumb = meta.crumbs.length > 1;

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarIntro}>
        {showBreadcrumb ? (
          <div className={styles.breadcrumb}>
            {meta.crumbs.map((crumb, index) => (
              <span
                key={`${crumb}-${index}`}
                className={index === meta.crumbs.length - 1 ? styles.breadcrumbCurrent : styles.breadcrumbMuted}
              >
                {index > 0 ? <span className={styles.breadcrumbSep}>/</span> : null}
                {crumb}
              </span>
            ))}
          </div>
        ) : null}
        <div className={styles.topbarHeading}>
          <p className={styles.topbarTitle}>{meta.title}</p>
          <p className={styles.topbarSubtitle}>{meta.subtitle}</p>
        </div>
      </div>

      <div className={styles.topbarActions}>
        <div className={styles.topbarTenant}>
          <span className={styles.topbarTenantLabel}>Active Tenant</span>
          <strong>{tenantName}</strong>
        </div>
        <Link className={styles.topbarLink} href="/app/help">
          Help
        </Link>
        <Link className={styles.topbarLink} href="/app/settings/theme">
          Theme
        </Link>
        <span className={styles.topbarAvatar}>{userInitial}</span>
      </div>
    </header>
  );
}
