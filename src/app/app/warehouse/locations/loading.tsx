import PageHeader from "../../_ui/page-header";
import styles from "./page.module.css";

export default function LocationsLoading() {
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Logistics"
        title="Locations"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
      <p className={styles.loadingHint}>Loading locations…</p>
    </div>
  );
}
