import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveLinkSource } from "./link-source";
import ShopifyConnectContent from "./shopify-connect-content";

interface Props {
  searchParams: Promise<{ handoff?: string }>;
}

export default async function ShopifyConnectPage({ searchParams }: Props) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shopify_pending_install")?.value ?? "";
  const { handoff } = await searchParams;

  // Two ways in: the OAuth callback's cookie, or a signed handoff minted by the
  // embedded surface after a Shopify-managed install (which never reaches the
  // callback, so never sets the cookie).
  const source = resolveLinkSource(raw, handoff ?? null);

  if (!source) {
    redirect("/app/settings/integrations?shopify=install-expired");
  }

  return <ShopifyConnectContent shopDomain={source.shop} handoff={source.mode === "handoff" ? (handoff ?? null) : null} />;
}
