import { getServerTenantContext } from "@/lib/tenant/context";
import SettingsSidebar from "./settings-sidebar";
import styles from "./settings-layout.module.css";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getServerTenantContext();
  const isAdmin = ctx?.role === "admin" || ctx?.role === "super_admin";

  return (
    <div className={styles.layout}>
      <SettingsSidebar isAdmin={isAdmin} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
