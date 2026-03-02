import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ExportBalanceRow = {
  component: { name: string | null; sku: string | null } | Array<{ name: string | null; sku: string | null }> | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
  on_hand: number | null;
  in_prod: number | null;
  reserved: number | null;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_balance")
    .select(
      "component:component_id(name,sku),location:location_id(name),on_hand,in_prod,reserved"
    )
    .order("on_hand", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = ["Component", "SKU", "Location", "OnHand", "InProd", "Reserved"];
  const rows =
    (data as ExportBalanceRow[] | null)?.map((row) => {
      const component = Array.isArray(row.component)
        ? row.component[0] ?? null
        : row.component;
      const location = Array.isArray(row.location)
        ? row.location[0] ?? null
        : row.location;
      return [
        component?.name ?? "",
        component?.sku ?? "",
        location?.name ?? "",
        row.on_hand ?? 0,
        row.in_prod ?? 0,
        row.reserved ?? 0,
      ];
    }) ?? [];

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const cell = String(value ?? "");
          if (cell.includes(",") || cell.includes('"')) {
            return `"${cell.replaceAll('"', '""')}"`;
          }
          return cell;
        })
        .join(",")
    )
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=inventory.csv",
    },
  });
}
