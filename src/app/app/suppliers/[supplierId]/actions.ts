"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function updateSupplier(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("suppliers")
    .update({
      contact_name: formData.get("contact_name")?.toString() ?? null,
      contact_email: formData.get("contact_email")?.toString() ?? null,
      contact_phone: formData.get("contact_phone")?.toString() ?? null,
      website: formData.get("website")?.toString() ?? null,
      address: formData.get("address")?.toString() ?? null,
      payment_terms: formData.get("payment_terms")?.toString() ?? null,
      default_currency: formData.get("default_currency")?.toString() ?? null,
      default_lead_time_days: formData.get("default_lead_time_days")
        ? Number(formData.get("default_lead_time_days"))
        : null,
      notes: formData.get("notes")?.toString() ?? null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", supplierId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function archiveSupplier(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("suppliers")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("id", supplierId);

  revalidatePath("/app/suppliers");
  redirect("/app/suppliers");
}

export async function addContact(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId) return;
  const { supabase, tenantId } = context;

  await supabase.from("supplier_contacts").insert({
    tenant_id: tenantId,
    supplier_id: supplierId,
    name: formData.get("name")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? null,
    phone: formData.get("phone")?.toString() ?? null,
    role: formData.get("role")?.toString() ?? null,
  });

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function removeContact(formData: FormData) {
  const contactId = formData.get("contact_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !contactId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("supplier_contacts")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", contactId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function linkComponent(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId || !componentId) return;
  const { supabase, tenantId } = context;

  await supabase.from("supplier_components").upsert(
    {
      tenant_id: tenantId,
      supplier_id: supplierId,
      component_id: componentId,
      supplier_part_number: formData.get("supplier_part_number")?.toString() ?? null,
      unit_cost: formData.get("unit_cost") ? Number(formData.get("unit_cost")) : null,
      currency: formData.get("currency")?.toString() ?? null,
      lead_time_days: formData.get("lead_time_days")
        ? Number(formData.get("lead_time_days"))
        : null,
      moq: formData.get("moq") ? Number(formData.get("moq")) : null,
    },
    { onConflict: "tenant_id,supplier_id,component_id" }
  );

  revalidatePath(`/app/suppliers/${supplierId}`);
  revalidatePath(`/app/components/${componentId}`);
}

export async function unlinkComponent(formData: FormData) {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierComponentId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("supplier_components")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function togglePreferred(formData: FormData) {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierComponentId || !componentId) return;
  const { supabase, tenantId } = context;

  const { data: current } = await supabase
    .from("supplier_components")
    .select("is_preferred")
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId)
    .maybeSingle();

  if (!current) return;

  if (current.is_preferred) {
    await supabase
      .from("supplier_components")
      .update({ is_preferred: false })
      .eq("tenant_id", tenantId)
      .eq("id", supplierComponentId);
  } else {
    // Clear others for this component first, then set this one
    await supabase
      .from("supplier_components")
      .update({ is_preferred: false })
      .eq("tenant_id", tenantId)
      .eq("component_id", componentId)
      .neq("id", supplierComponentId);

    await supabase
      .from("supplier_components")
      .update({ is_preferred: true })
      .eq("tenant_id", tenantId)
      .eq("id", supplierComponentId);
  }

  revalidatePath(`/app/suppliers/${supplierId}`);
  revalidatePath(`/app/components/${componentId}`);
}

export async function addPriceBreak(formData: FormData) {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierComponentId) return;
  const { supabase, tenantId } = context;

  // Verify ownership via supplier_components
  const { data: sc } = await supabase
    .from("supplier_components")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId)
    .maybeSingle();

  if (!sc) return;

  await supabase.from("supplier_component_price_breaks").insert({
    tenant_id: tenantId,
    supplier_component_id: supplierComponentId,
    min_quantity: Number(formData.get("min_quantity")),
    unit_cost: Number(formData.get("unit_cost")),
  });

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function removePriceBreak(formData: FormData) {
  const priceBreakId = formData.get("price_break_id")?.toString() ?? "";
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !priceBreakId) return;
  const { supabase, tenantId } = context;

  // Verify ownership via supplier_components
  const { data: sc } = await supabase
    .from("supplier_components")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId)
    .maybeSingle();

  if (!sc) return;

  await supabase
    .from("supplier_component_price_breaks")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", priceBreakId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}
