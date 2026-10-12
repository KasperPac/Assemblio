import Link from "next/link";
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";

export default function ConnectSquarePage() {
  return (
    <ArticleLayout
      title="Connect Square and map retail stock"
      description="Authorise Square, map products and locations, and count opening stock before enabling stock updates."
      category="getting-started"
      relatedSlugs={["getting-started/first-stocktake", "inventory/adjustments", "inventory/movements", "purchasing/goods-inwards"]}
    >
      <p>
        Square connects retail products and completed sales to Manuva. Shopify does not need
        to be connected. Manuva owns your stock records; appointment services and other
        non-stock items do not consume components. Xero receives supplier bills from Manuva,
        not Square sales, so revenue is not sent twice.
      </p>

      <h2>Who can set this up?</h2>
      <table>
        <thead><tr><th>Role</th><th>Access</th></tr></thead>
        <tbody>
          <tr><td>Member</td><td>Cannot connect, sync, map products, or enable stock updates.</td></tr>
          <tr><td>Admin</td><td>Can manage Square for an enabled pilot workspace.</td></tr>
          <tr><td>Super admin</td><td>Can manage Square after selecting an enabled workspace.</td></tr>
          <tr><td>Platform observer</td><td>Cannot change the connection.</td></tr>
        </tbody>
      </table>
      <p>The Square account owner must authorise access in Square. A Manuva invitation does not authorise either Square or Xero.</p>

      <h2>Connect the account</h2>
      <Steps>
        <Step>Open <Link href="/app/settings/integrations">Settings → Integrations</Link>. Square is visible only for enabled pilot workspaces.</Step>
        <Step>Select <strong>&quot;Connect Square&quot;</strong>. The account owner signs in to Square and approves access.</Step>
        <Step>Select <strong>&quot;Manage Square&quot;</strong>. Check the merchant and environment. <strong>&quot;Sandbox&quot;</strong> is for test transactions; a live business needs <strong>&quot;Production&quot;</strong>.</Step>
        <Step>Select <strong>&quot;Sync Square&quot;</strong> to import the catalogue and completed sales.</Step>
      </Steps>
      <p>The card shows <strong>&quot;Not connected&quot;</strong>, <strong>&quot;Connected&quot;</strong>, <strong>&quot;Needs reconnect&quot;</strong>, or <strong>&quot;Not configured&quot;</strong>. If it says &quot;Not configured&quot;, an operator must complete setup before the account owner can connect. Select <strong>&quot;Reconnect Square&quot;</strong> if access has expired or been revoked.</p>

      <h2>Map locations and products</h2>
      <Steps>
        <Step>Select <strong>&quot;Map location&quot;</strong>, choose the active Square location and its Manuva stock location, then select <strong>&quot;Save mapping&quot;</strong>. Set a default Manuva location before creating retail items.</Step>
        <Step>Under <strong>&quot;Product mappings&quot;</strong>, filter <strong>&quot;Mapping status&quot;</strong> to <strong>&quot;Unmatched&quot;</strong> or <strong>&quot;Ambiguous&quot;</strong>. SKU matching precedes barcode matching; duplicates require a manual choice.</Step>
        <Step>Select <strong>&quot;Resolve mapping&quot;</strong>. Choose <strong>&quot;Link existing retail variant&quot;</strong>, <strong>&quot;Create retail item&quot;</strong>, <strong>&quot;Ignore non-stock item&quot;</strong>, or <strong>&quot;Remove link&quot;</strong>.</Step>
        <Step>For an existing variant, choose a retail item with a 1:1 active BOM: one component, quantity 1, and 100% yield. To ignore a non-stock item, enter a reason. Select <strong>&quot;Save mapping&quot;</strong>.</Step>
        <Step>Select <strong>&quot;Sync Square&quot;</strong> to retry orders waiting for mappings.</Step>
      </Steps>
      <p>
        New retail items start with zero stock. Services and items without Square inventory
        tracking cannot become retail links. An order waits until every stock line is mapped
        or ignored; its stock is not partially deducted while another line remains unresolved.
        Saving a product or location mapping pauses stock updates to Square.
      </p>
      <p>
        The <strong>&quot;Source&quot;</strong> column shows <strong>&quot;Catalogue&quot;</strong> or <strong>&quot;Sale line&quot;</strong>.
        Custom items and missing or deleted catalogue variations need a manual sale-line
        mapping. Link the retail stock actually sold, create a retail item, or ignore a
        service with a reason. Sale-only aliases can share a retail variant and consume
        its stock; they do not receive independent Square quantity updates. Custom lines
        are specific to their order, so another sale with the same label needs its own review.
      </p>
      <p>Converted catalogue variations consume the ratio configured in Square from their stockable item. They do not each receive a full-stock quantity update. The list has 50 mappings per page; use <strong>&quot;Find retail variants by SKU&quot;</strong> to narrow the mapping choices.</p>

      <h2>Count opening stock before enabling updates</h2>
      <Steps>
        <Step>Resolve all unmatched and ambiguous entries and map the trading locations.</Step>
        <Step>Complete the physical opening stock count in Manuva. Catalogue import does not copy Square quantities into Manuva balances.</Step>
        <Step>Under <strong>&quot;Stock updates to Square&quot;</strong>, tick <strong>&quot;I have completed the opening stock count in Manuva and checked every product and location mapping.&quot;</strong></Step>
        <Step>Select <strong>&quot;Enable stock updates&quot;</strong>. Manuva records the opening sales baseline. Earlier sales are covered by the count and are not deducted again.</Step>
      </Steps>
      <p>Stock updates begin disabled. Later completed sales use Manuva&apos;s movement ledger; a replay or retry does not deduct the same sale twice. <strong>&quot;Disable stock updates&quot;</strong> pauses outbound quantities. Re-enabling preserves the first baseline and requires checking counts and mappings again.</p>
      <p>Square physical &quot;IN_STOCK&quot; count changes can record restocks. A non-echo absolute count with existing Manuva reservations requires manual review and is refused to avoid deducting reserved stock twice. Refunds do not automatically restock goods or send financial adjustments to Xero. Record a stock change only when goods were physically returned.</p>

      <h2>Resolve errors and waiting work</h2>
      <p>The management page shows stock lines awaiting mapping, pending events, and failed events. Resolve mappings, then select <strong>&quot;Sync Square&quot;</strong> to retry. Reconnect if failures continue.</p>
      <ul>
        <li><strong>&quot;Square connection failed. Try connecting again. The Square account owner must authorise access.&quot;</strong> — repeat authorisation with the account owner.</li>
        <li><strong>&quot;Square sync is running. Wait for it to finish, then try again.&quot;</strong> — another sync or administrator is using the connection. Wait and retry.</li>
        <li><strong>&quot;Confirm the opening stock count before enabling Square stock updates.&quot;</strong> — complete the count and tick the acknowledgement.</li>
        <li><strong>&quot;Couldn&apos;t change Square stock updates. Map locations and resolve every product first, then try again.&quot;</strong> — review setup and retry. Do not assume updates are enabled.</li>
        <li><strong>&quot;Couldn&apos;t save that product mapping. Check that a default Manuva location is set, then try again.&quot;</strong> — check the default location and selected retail variant, then retry.</li>
      </ul>

      <h2>Disconnect</h2>
      <p>Select <strong>&quot;Disconnect Square&quot;</strong>, review the confirmation, and confirm. Sales sync and stock updates stop; Manuva products, movements, and balances remain. If the message says <strong>&quot;Square disconnected locally. The account owner must also remove Manuva access in Square.&quot;</strong>, the owner must remove the authorisation in Square.</p>
    </ArticleLayout>
  );
}
