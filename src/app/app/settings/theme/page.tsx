import Link from "next/link";
import ThemePicker from "./theme-picker";
import styles from "./theme.module.css";

export default function ThemeSettingsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>
            <Link href="/app/settings">Settings</Link>
            <span>&gt;</span>
            <span>Theme</span>
          </div>
          <h1>Theme</h1>
          <p>Choose a visual theme for your workspace.</p>
        </div>
      </div>
      <ThemePicker />
    </div>
  );
}
