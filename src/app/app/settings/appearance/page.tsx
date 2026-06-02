import PageHeader from "../../_ui/page-header";
import ThemePicker from "./theme-picker";

export default function AppearancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Appearance"
        description="Choose a visual theme for your workspace."
      />
      <ThemePicker />
    </>
  );
}
