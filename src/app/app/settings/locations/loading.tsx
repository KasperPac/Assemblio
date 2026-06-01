import PageHeader from "../../_ui/page-header";
import styles from "./locations.module.css";

export default function LocationsSettingsLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Default Location"
        description="Set the default warehouse location used across the workspace."
      />
      <p className={styles.loadingHint}>Loading locations…</p>
    </>
  );
}
