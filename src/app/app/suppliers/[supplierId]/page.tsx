import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import SupplierTabs from "./supplier-tabs";
import styles from "./supplier-tabs.module.css";
import {
  updateSupplier,
  archiveSupplier,
  addContact,
  removeContact,
  linkComponent,
  unlinkComponent,
  togglePreferred,
  addPriceBreak,
  removePriceBreak,
} from "./actions";
import type {
  Supplier,
  SupplierContact,
  SupplierComponent,
  SupplierComponentPriceBreak,
} from "@/lib/suppliers/types";
import { getAvgActualLeadTimes } from "@/lib/suppliers/catalog";

type PoRow = {
  id: string;
  status: string;
  created_at: string;
  expected_date: string | null;
  purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
  delivery_receipt: Array<{ received_at: string }>;
};

type Props = { params: Promise<{ supplierId: string }> };

export default async function SupplierDetailPage({ params }: Props) {
  const { supplierId } = await params;
  const context = await getServerTenantContext();
  if (!context || !context.tenantId) notFound();
  const { supabase, tenantId } = context;

  const [
    { data: supplier },
    { data: contacts },
    { data: catalogRows },
    { data: allComponents },
    { data: posData },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", supplierId)
      .maybeSingle(),
    supabase
      .from("supplier_contacts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("supplier_components")
      .select("*, supplier_component_price_breaks(*), component:component_id(id,name,unit)")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .order("created_at"),
    supabase
      .from("component")
      .select("id,name,sku")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("purchase_order")
      .select(`
        id, status, created_at, expected_date,
        purchase_order_line(quantity, unit_cost),
        delivery_receipt(received_at)
      `)
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (!supplier) notFound();

  const s = supplier as Supplier;
  const avgLeadTimesMap = await getAvgActualLeadTimes(supabase, tenantId, supplierId);

  const typedContacts = (contacts ?? []) as SupplierContact[];
  const typedCatalog = (catalogRows ?? []) as Array<
    SupplierComponent & {
      supplier_component_price_breaks: SupplierComponentPriceBreak[];
      component: { id: string; name: string; unit: string | null } | null;
    }
  >;
  const typedPos = (posData ?? []) as PoRow[];

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/app/suppliers" className={styles.backButton}>&larr; Suppliers</Link>
      </div>

      <div className={styles.supplierHeader}>
        <div>
          <h1 className={styles.supplierName}>{s.name}</h1>
          <span className={styles.supplierMeta}>
            {s.website ? `${s.website} · ` : ""}
            {s.is_active ? "Active" : "Archived"}
          </span>
        </div>
        <form action={archiveSupplier}>
          <input type="hidden" name="supplier_id" value={s.id} />
          <button type="submit" className={styles.btnDanger}>
            Archive
          </button>
        </form>
      </div>

      <SupplierTabs
        supplier={s}
        contacts={typedContacts}
        catalog={typedCatalog}
        avgLeadTimes={avgLeadTimesMap}
        allComponents={(allComponents ?? []) as Array<{ id: string; name: string; sku: string | null }>}
        pos={typedPos}
        actions={{
          updateSupplier,
          addContact,
          removeContact,
          linkComponent,
          unlinkComponent,
          togglePreferred,
          addPriceBreak,
          removePriceBreak,
        }}
      />
    </div>
  );
}
