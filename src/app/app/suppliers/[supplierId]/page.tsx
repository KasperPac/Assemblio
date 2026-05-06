import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

type Props = { params: Promise<{ supplierId: string }> };

export default async function SupplierDetailPage({ params }: Props) {
  const { supplierId } = await params;
  const supabase = await createSupabaseServerClient();

  const [
    { data: supplier },
    { data: contacts },
    { data: catalogRows },
    { data: allComponents },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .maybeSingle(),
    supabase
      .from("supplier_contacts")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("supplier_components")
      .select("*, supplier_component_price_breaks(*), component:component_id(id,name,unit)")
      .eq("supplier_id", supplierId)
      .order("created_at"),
    supabase
      .from("component")
      .select("id,name,sku")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (!supplier) notFound();

  const s = supplier as Supplier;
  const tenantId = s.tenant_id;
  const avgLeadTimesMap = await getAvgActualLeadTimes(supabase, tenantId, supplierId);

  const typedContacts = (contacts ?? []) as SupplierContact[];
  const typedCatalog = (catalogRows ?? []) as Array<
    SupplierComponent & {
      supplier_component_price_breaks: SupplierComponentPriceBreak[];
      component: { id: string; name: string; unit: string | null } | null;
    }
  >;

  return (
    <div className={styles.detailPage}>
      <div className={styles.backRow}>
        <Link href="/app/suppliers" className={styles.backLink}>&larr; Suppliers</Link>
      </div>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.supplierName}>{s.name}</h1>
          {s.website && (
            <span className={styles.supplierMeta}>
              {s.website} · {s.is_active ? "Active" : "Archived"}
            </span>
          )}
          {!s.website && (
            <span className={styles.supplierMeta}>
              {s.is_active ? "Active" : "Archived"}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <form action={archiveSupplier}>
            <input type="hidden" name="supplier_id" value={s.id} />
            <button type="submit" className={styles.btnDanger}>
              {s.is_active ? "Archive" : "Unarchive"}
            </button>
          </form>
        </div>
      </div>

      <SupplierTabs
        supplier={s}
        contacts={typedContacts}
        catalog={typedCatalog}
        avgLeadTimes={avgLeadTimesMap}
        allComponents={(allComponents ?? []) as Array<{ id: string; name: string; sku: string | null }>}
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
