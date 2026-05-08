import { redirect } from "next/navigation";

export default function ThemeSettingsRedirect() {
  redirect("/app/settings/appearance");
}
