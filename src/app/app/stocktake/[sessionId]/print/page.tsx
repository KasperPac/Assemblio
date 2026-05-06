import { notFound, redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { type BinRef, binName } from "../counting-sheet";

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ sublocation?: string; aisle?: string; bay?: string }>;
};

type LineRow = {
  id: string;
  expected_on_hand: number;
  component: {
    name: string | null;
    sku: string | null;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  } | Array<{
    name: string | null;
    sku: string | null;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  }> | null;
};

export default async function PrintPage({ params, searchParams }: Props) {
  const { sessionId } = await params;
  const sp = (await searchParams) ?? {};

  const context = await getServerTenantContext();
  if (!context) redirect("/sign-in");
  const { supabase, tenantId } = context;

  const [{ data: sessionData, error: sessionError }, { data: linesData, error: linesError }] = await Promise.all([
    supabase
      .from("stocktake_session")
      .select("id,reference_number,session_type,blind_count,created_at,location:location_id(name)")
      .eq("tenant_id", tenantId)
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("stocktake_line")
      .select("id,expected_on_hand,component:component_id(name,sku,bin_sub_location:bin_sub_location_id(name),bin_aisle:bin_aisle_id(name),bin_bay:bin_bay_id(name))")
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId),
  ]);

  if (sessionError) throw new Error(`Failed to load session: ${sessionError.message}`);
  if (linesError) throw new Error(`Failed to load lines: ${linesError.message}`);

  if (!sessionData) notFound();

  const session = sessionData as {
    id: string;
    reference_number: string | null;
    session_type: string;
    blind_count: boolean;
    created_at: string;
    location: { name: string | null } | Array<{ name: string | null }> | null;
  };

  const locationName = (Array.isArray(session.location) ? session.location[0] : session.location)?.name ?? "—";
  const allLines = (linesData ?? []) as LineRow[];

  // Filter by scope
  let lines = allLines;
  let sectionLabel = "Full session";

  if (sp.sublocation) {
    lines = lines.filter((l) => {
      const c = Array.isArray(l.component) ? l.component[0] : l.component;
      return binName(c?.bin_sub_location ?? null) === sp.sublocation;
    });
    sectionLabel = sp.sublocation;
    if (sp.aisle) {
      lines = lines.filter((l) => {
        const c = Array.isArray(l.component) ? l.component[0] : l.component;
        return binName(c?.bin_aisle ?? null) === sp.aisle;
      });
      sectionLabel += ` → ${sp.aisle}`;
      if (sp.bay) {
        lines = lines.filter((l) => {
          const c = Array.isArray(l.component) ? l.component[0] : l.component;
          return binName(c?.bin_bay ?? null) === sp.bay;
        });
        sectionLabel += ` → ${sp.bay}`;
      }
    }
  }

  lines.sort((a, b) => {
    const ca = (Array.isArray(a.component) ? a.component[0] : a.component)?.name ?? "";
    const cb = (Array.isArray(b.component) ? b.component[0] : b.component)?.name ?? "";
    return ca.localeCompare(cb);
  });

  const dateStr = new Date(session.created_at).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: Georgia, serif; color: #111; background: #fff; margin: 0; padding: 24px 32px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
        h1 { font-size: 1rem; margin: 0 0 4px; font-family: Arial, sans-serif; }
        .meta { font-size: 0.82rem; color: #444; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
        .sig-block { text-align: right; }
        .sig-line { border-bottom: 1px solid #111; width: 160px; height: 24px; margin: 4px 0 10px auto; }
        .sig-label { font-size: 0.75rem; color: #555; font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 8px; }
        th { text-align: left; padding: 6px 8px; font-family: Arial, sans-serif; font-size: 0.75rem; border-bottom: 1px solid #888; }
        th.center { text-align: center; }
        td { padding: 8px 8px; border-bottom: 1px solid #ddd; vertical-align: middle; }
        td.center { text-align: center; }
        .blank-line { border-bottom: 1px solid #aaa; width: 70px; height: 20px; margin: 0 auto; }
        .note-line { border-bottom: 1px solid #ddd; height: 20px; width: 100%; }
        footer { margin-top: 16px; font-size: 0.75rem; color: #666; border-top: 1px solid #ddd; padding-top: 8px; font-family: Arial, sans-serif; }
        .print-btn { margin-bottom: 16px; padding: 8px 16px; font-size: 0.9rem; cursor: pointer; }
      `}</style>

      <button className="print-btn no-print" id="print-btn">
        Print this sheet
      </button>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-btn').onclick = function(){ window.print(); };" }} />

      <div className="header">
        <div>
          <h1>ASSEMBLIO — STOCKTAKE SHEET</h1>
          <p className="meta">
            Session: <strong>{session.reference_number ?? sessionId.slice(0, 8)}</strong>
            {" · "}
            {session.session_type === "initial" ? "Initial count" : "Full count"}
            {" · "}
            {locationName}
          </p>
          <p className="meta">
            Date: {dateStr}
            {" · "}
            <strong>Section: {sectionLabel}</strong>
          </p>
          {session.blind_count && (
            <p className="meta" style={{ color: "#c00", marginTop: "4px" }}>
              ⚠ Blind count — do not disclose expected quantities to counter
            </p>
          )}
        </div>
        <div className="sig-block">
          <p className="sig-label">Counter name:</p>
          <div className="sig-line" />
          <p className="sig-label">Signature:</p>
          <div className="sig-line" />
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>SKU</th>
            {!session.blind_count && <th className="center">Expected</th>}
            <th className="center">Counted</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const comp = Array.isArray(line.component) ? line.component[0] : line.component;
            return (
              <tr key={line.id}>
                <td>{comp?.name ?? "Unknown"}</td>
                <td style={{ color: "#555" }}>{comp?.sku ?? "—"}</td>
                {!session.blind_count && (
                  <td className="center">{Number(line.expected_on_hand).toFixed(0)}</td>
                )}
                <td className="center"><div className="blank-line" /></td>
                <td><div className="note-line" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer>
        {session.blind_count
          ? "Blind count session — expected quantities are not shown. Count what you see and record it."
          : "Enter counted quantities in the spaces provided."}
        {" "}Return this sheet to your supervisor when complete.
      </footer>
    </>
  );
}
