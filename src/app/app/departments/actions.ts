"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity } from "@/lib/activity/log";

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = value?.toString().trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCheckbox(value: FormDataEntryValue | null) {
  return value === "on";
}

function encodeMessage(message: string) {
  return encodeURIComponent(message);
}

export async function createDepartment(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const code = formData.get("code")?.toString().trim().toUpperCase() ?? "";
  const defaultEfficiency = parseNumber(formData.get("default_efficiency_pct"), 100);
  const laborRate = parseNumber(formData.get("labor_rate_per_hour"));
  const adminRate = parseNumber(formData.get("admin_rate_per_hour"));
  const electricityRate = parseNumber(formData.get("electricity_rate_per_kwh"));
  const gasRate = parseNumber(formData.get("gas_rate_per_unit"));
  const overheadRate = parseNumber(formData.get("overhead_rate_per_hour"));
  const effectiveFrom =
    formData.get("effective_from")?.toString().trim() ||
    new Date().toISOString().slice(0, 10);

  if (!name || !code) {
    redirect("/app/departments?error=Name+and+code+are+required.");
  }

  const context = await getServerTenantContext();
  if (!context) {
    redirect("/app/departments?error=Missing+tenant+context.");
  }

  const { supabase, tenantId } = context;
  const { data: department, error } = await supabase
    .from("department")
    .insert({
      tenant_id: tenantId,
      name,
      code,
      default_efficiency_pct: defaultEfficiency,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !department) {
    redirect(`/app/departments?error=${encodeMessage(error?.message ?? "Failed to create department.")}`);
  }

  const { error: rateError } = await supabase.from("cost_rate_schedule").insert({
    tenant_id: tenantId,
    department_id: department.id,
    effective_from: effectiveFrom,
    labor_rate_per_hour: laborRate,
    admin_rate_per_hour: adminRate,
    electricity_rate_per_kwh: electricityRate,
    gas_rate_per_unit: gasRate,
    overhead_rate_per_hour: overheadRate,
  });

  if (rateError) {
    redirect(`/app/departments?error=${encodeMessage(rateError.message)}`);
  }

  revalidatePath("/app/departments");
  revalidatePath("/app/staffing");
  revalidatePath("/app/costing");
  revalidatePath("/app/capacity");
  revalidatePath("/app/actual-time");
  revalidatePath("/app/reports");
  await logActivity({ event: "department.created", entityId: department.id, metadata: { name } });
  redirect(`/app/departments?success=${encodeMessage(`Created ${name}.`)}`);
}

export async function updateDepartment(formData: FormData) {
  const departmentId = formData.get("department_id")?.toString() ?? "";
  const rateScheduleId = formData.get("rate_schedule_id")?.toString() || null;
  const name = formData.get("name")?.toString().trim() ?? "";
  const code = formData.get("code")?.toString().trim().toUpperCase() ?? "";
  const defaultEfficiency = parseNumber(formData.get("default_efficiency_pct"), 100);
  const isActive = parseCheckbox(formData.get("is_active"));
  const laborRate = parseNumber(formData.get("labor_rate_per_hour"));
  const adminRate = parseNumber(formData.get("admin_rate_per_hour"));
  const electricityRate = parseNumber(formData.get("electricity_rate_per_kwh"));
  const gasRate = parseNumber(formData.get("gas_rate_per_unit"));
  const overheadRate = parseNumber(formData.get("overhead_rate_per_hour"));
  const effectiveFrom =
    formData.get("effective_from")?.toString().trim() ||
    new Date().toISOString().slice(0, 10);

  if (!departmentId || !name || !code) {
    redirect("/app/departments?error=Department+details+are+required.");
  }

  const context = await getServerTenantContext();
  if (!context) {
    redirect("/app/departments?error=Missing+tenant+context.");
  }

  const { supabase, tenantId } = context;
  const { error } = await supabase
    .from("department")
    .update({
      name,
      code,
      default_efficiency_pct: defaultEfficiency,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", departmentId);

  if (error) {
    redirect(`/app/departments?error=${encodeMessage(error.message)}`);
  }

  if (rateScheduleId) {
    const { error: rateError } = await supabase
      .from("cost_rate_schedule")
      .update({
        effective_from: effectiveFrom,
        labor_rate_per_hour: laborRate,
        admin_rate_per_hour: adminRate,
        electricity_rate_per_kwh: electricityRate,
        gas_rate_per_unit: gasRate,
        overhead_rate_per_hour: overheadRate,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", rateScheduleId);

    if (rateError) {
      redirect(`/app/departments?error=${encodeMessage(rateError.message)}`);
    }
  } else {
    const { error: rateError } = await supabase.from("cost_rate_schedule").insert({
      tenant_id: tenantId,
      department_id: departmentId,
      effective_from: effectiveFrom,
      labor_rate_per_hour: laborRate,
      admin_rate_per_hour: adminRate,
      electricity_rate_per_kwh: electricityRate,
      gas_rate_per_unit: gasRate,
      overhead_rate_per_hour: overheadRate,
    });

    if (rateError) {
      redirect(`/app/departments?error=${encodeMessage(rateError.message)}`);
    }
  }

  revalidatePath("/app/departments");
  revalidatePath("/app/staffing");
  revalidatePath("/app/costing");
  revalidatePath("/app/capacity");
  revalidatePath("/app/actual-time");
  revalidatePath("/app/reports");
  await logActivity({ event: "department.updated", entityId: departmentId });
  redirect(`/app/departments?success=${encodeMessage(`Updated ${name}.`)}`);
}
