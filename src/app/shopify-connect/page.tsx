import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPendingInstall } from "@/lib/shopify/pending-install";
import ShopifyConnectContent from "./shopify-connect-content";

export default async function ShopifyConnectPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shopify_pending_install")?.value ?? "";
  const pending = verifyPendingInstall(raw);

  if (!pending) {
    redirect("/app/settings/integrations?shopify=install-expired");
  }

  return <ShopifyConnectContent shopDomain={pending.shop} />;
}
