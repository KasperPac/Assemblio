const L = 176;
const W = 320;
const CX = 336;
const SX = 536;
const SW = 200;
const EDGE = "var(--ink-faint)";
const INK = "var(--ink-strong)";
const QUIET = "var(--ink-muted)";

type Step = { y: number; h: number; role: string; name: string; lines: string[]; accent?: boolean };

const STEPS: Step[] = [
  { y: 64, h: 56, role: "Purchasing", name: "1  Raise the purchase order", lines: ["On the Purchase Orders page"] },
  { y: 152, h: 56, role: "Warehouse", name: "2  Receive the goods", lines: ["Goods Inwards: a receipt against the PO"] },
  { y: 240, h: 56, role: "Purchasing", name: "3  Enter the supplier invoice", lines: ["From the PO or receipt, saved as Draft"] },
  { y: 328, h: 56, role: "Purchasing", name: "4  Post the invoice", lines: ["Locks it; can also update component costs"] },
  {
    y: 432,
    h: 72,
    role: "Manuva, automatic",
    name: "5  Manuva sends the bill",
    lines: ["Queued for Xero, then Sent to Xero", "Supplier contact linked or created first"],
    accent: true,
  },
  { y: 536, h: 56, role: "Xero", name: "6  Bill lands as Awaiting Approval", lines: ["Nothing is approved or paid automatically"] },
  { y: 624, h: 56, role: "Accountant", name: "7  Accountant approves and pays", lines: ["In Xero, like any other bill"] },
];

/** Purchase to payment: who does each step, and where Xero takes over. */
export default function PurchasingAndXeroDiagram() {
  return (
    <svg viewBox="0 0 760 720" role="img" aria-label="Manuva sends the bill; your accountant approves and pays it in Xero" fontSize={13}>
      <defs>
        <marker id="m-purchasing-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        Manuva sends the bill; your accountant approves and pays it in Xero
      </text>

      <rect x={16} y={520} width={728} height={176} rx={8} fill="var(--surface-1)" />
      <text x={728} y={542} textAnchor="end" fontSize={11.5} fontWeight={600} fill={QUIET}>
        In Xero
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        {[120, 208, 296, 384, 504, 592].map((y0, i) => (
          <path key={y0} d={`M${CX} ${y0}V${[152, 240, 328, 432, 536, 624][i]}`} markerEnd="url(#m-purchasing-arrow)" />
        ))}
        <path d={`M${L + W} 356H${SX + SW / 2}V432`} markerEnd="url(#m-purchasing-arrow)" />
      </g>
      <text x={CX + 12} y={412} fontSize={11.5} fill={QUIET}>
        Xero connected and set up
      </text>
      <text x={L + W + 12} y={346} fontSize={11.5} fill={QUIET}>
        No Xero, or setup not finished
      </text>

      {STEPS.map((s) => (
        <g key={s.name}>
          <rect
            x={L}
            y={s.y}
            width={W}
            height={s.h}
            rx={8}
            fill={s.accent ? "var(--brand-dim)" : "var(--bg-card)"}
            stroke={s.accent ? "var(--brand-1)" : EDGE}
            strokeWidth={s.accent ? 2 : 1.25}
          />
          <text x={24} y={s.y + s.h / 2 + 4} fontSize={11.5} fontWeight={600} fill={QUIET}>
            {s.role}
          </text>
          <text x={L + 16} y={s.y + 24} fontWeight={600} fill={INK}>
            {s.name}
          </text>
          {s.lines.map((line, i) => (
            <text key={line} x={L + 16} y={s.y + 40 + i * 16} fontSize={11.5} fill={s.accent ? INK : QUIET}>
              {line}
            </text>
          ))}
        </g>
      ))}

      <rect x={SX} y={432} width={SW} height={72} rx={8} fill="var(--bg-card)" stroke={EDGE} strokeWidth={1.25} />
      <text x={SX + 16} y={456} fontWeight={600} fill={INK}>
        Stays in Manuva
      </text>
      <text x={SX + 16} y={472} fontSize={11.5} fill={QUIET}>
        Badge: Posted
      </text>
      <text x={SX + 16} y={488} fontSize={11.5} fill={QUIET}>
        Nothing is sent to Xero
      </text>
    </svg>
  );
}
