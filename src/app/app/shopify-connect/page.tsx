import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPendingInstall } from "@/lib/shopify/pending-install";
import ShopifyConnectContent from "./shopify-connect-content";

export default async function ShopifyConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; shopify?: string }>;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shopify_pending_install")?.value ?? "";
  const pending = verifyPendingInstall(raw);

  if (!pending) {
    redirect("/app/settings?shopify=install-expired");
  }

  const params = await searchParams;
  const shopDisplay = params.shop ?? pending.shop;

  return <ShopifyConnectContent shopDomain={shopDisplay} />;
}
