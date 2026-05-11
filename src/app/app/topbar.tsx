"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { getRouteMeta, getDynamicBreadcrumbs } from "./route-meta";
import { signOut, switchActiveTenant } from "./actions";
import styles from "./shell.module.css";

type Props = {
  userInitial: string;
  selectableTenants: { id: string; name: string }[];
  currentTenantId: string;
  tenantName: string;
};

export default function Topbar({ userInitial, selectableTenants, currentTenantId, tenantName }: Props) {
  const pathname = usePathname();
  const meta = getRouteMeta(pathname);
  const crumbs = getDynamicBreadcrumbs(pathname);
  const showBreadcrumb = crumbs.length > 0;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarIntro}>
        {showBreadcrumb && (
          <div className={styles.breadcrumb}>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.href}-${index}`} className={styles.breadcrumbMuted}>
                {index > 0 && <span className={styles.breadcrumbSep}>/</span>}
                <Link href={crumb.href} className={styles.breadcrumbLink}>
                  {crumb.label}
                </Link>
              </span>
            ))}
            <span className={styles.breadcrumbCurrent}>
              <span className={styles.breadcrumbSep}>/</span>
              {meta.title}
            </span>
          </div>
        )}
        <div className={styles.topbarHeading}>
          <p className={styles.topbarTitle}>{meta.title}</p>
          <p className={styles.topbarSubtitle}>{meta.subtitle}</p>
        </div>
      </div>

      <div className={styles.topbarActions}>
        <div className={styles.avatarWrapper} ref={ref}>
          <button
            type="button"
            className={styles.topbarAvatar}
            onClick={() => setOpen((v) => !v)}
            aria-label="User menu"
            aria-expanded={open}
          >
            {userInitial}
          </button>

          {open && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownMeta}>{tenantName}</span>
              </div>

              {selectableTenants.length > 1 && (
                <>
                  <div className={styles.dropdownDivider} />
                  <form action={switchActiveTenant} className={styles.dropdownTenantForm}>
                    <label className={styles.dropdownLabel}>Switch Tenant</label>
                    <select
                      name="tenant_id"
                      defaultValue={currentTenantId}
                      className={styles.dropdownSelect}
                    >
                      {selectableTenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <button type="submit" className={styles.dropdownSwitchBtn}>Switch</button>
                  </form>
                </>
              )}

              <div className={styles.dropdownDivider} />

              <Link href="/app/settings" className={styles.dropdownItem} onClick={() => setOpen(false)}>
                Settings
              </Link>
              <Link href="/app/help" className={styles.dropdownItem} onClick={() => setOpen(false)}>
                Help &amp; Docs
              </Link>

              <div className={styles.dropdownDivider} />

              <form action={signOut}>
                <button type="submit" className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}>
                  Log Out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
