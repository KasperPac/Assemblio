import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function ConnectShopifyPage() {
  return (
    <ArticleLayout
      title="Connect your Shopify store"
      description="Authorise Manuva to sync orders and products from your Shopify store."
      category="getting-started"
      relatedSlugs={["orders/shopify-sync", "orders/order-statuses"]}
    >
      <p>
        Connecting your Shopify store lets Manuva import orders automatically and match them to
        your products and BOMs. Once connected, new orders appear in Manuva within minutes of
        being placed in Shopify.
      </p>
      <Steps>
        <Step>Open <strong>Settings</strong> in the sidebar, then go to <strong>Integrations</strong>.</Step>
        <Step>Click <strong>Connect</strong> next to the Shopify section.</Step>
        <Step>Enter your store URL in the format <code>your-store.myshopify.com</code> and click <strong>Connect</strong>.</Step>
        <Step>You will be redirected to Shopify to review and approve the permissions. Click <strong>Install app</strong>.</Step>
        <Step>You are returned to Manuva. The store now shows as Connected.</Step>
        <Step>Click <strong>Sync now</strong> to import your existing orders and products immediately.</Step>
      </Steps>
      <Callout type="info">
        The initial sync imports orders from the last 60 days. After the first sync, new orders are imported automatically every few minutes.
      </Callout>
      <Callout type="tip">
        Make sure your Shopify product SKUs match the component or product codes in Manuva. Manuva uses SKUs to match order line items to the correct BOM.
      </Callout>
    </ArticleLayout>
  );
}
