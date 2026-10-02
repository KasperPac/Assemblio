const EDGE = "var(--ink-faint)";
const INK = "var(--ink-strong)";
const QUIET = "var(--ink-muted)";

const SX = 24;
const SW = 232;
const LX = 288;
const LW = 200;
const RX = 524;
const RW = 212;

type Box = { x: number; y: number; w: number; h: number; name: string; lines: string[]; accent?: boolean };

const SOURCES: Box[] = [
  { x: SX, y: 56, w: SW, h: 68, name: "Goods receipts", lines: ["Saving a receipt adds to", "On hand"] },
  { x: SX, y: 134, w: SW, h: 68, name: "Log Movement", lines: ["Any change to On hand", "or In prod"] },
  { x: SX, y: 212, w: SW, h: 68, name: "Stocktake commit", lines: ["Sets On hand to the", "counted figure"] },
  { x: SX, y: 290, w: SW, h: 68, name: "Retail sales", lines: ["A fulfilled retail order line", "takes stock off On hand"] },
  { x: SX, y: 368, w: SW, h: 68, name: "Order allocation", lines: ["Reserves and releases stock", "for open orders"] },
];

const LEDGER: Box = {
  x: LX,
  y: 200,
  w: LW,
  h: 92,
  name: "Stock movements",
  lines: ["One row for every change", "Reason, date and amounts"],
  accent: true,
};
const BALANCE: Box = {
  x: RX,
  y: 200,
  w: RW,
  h: 92,
  name: "Stock balance",
  lines: ["Per warehouse", "On hand, In prod, Reserved"],
};
const AVAILABLE: Box = {
  x: RX,
  y: 332,
  w: RW,
  h: 72,
  name: "Available",
  lines: ["On hand minus Reserved", "On a component's page"],
};

function BoxShape({ b }: { b: Box }) {
  return (
    <g>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={8}
        fill={b.accent ? "var(--brand-dim)" : "var(--bg-card)"}
        stroke={b.accent ? "var(--brand-1)" : EDGE}
        strokeWidth={b.accent ? 2 : 1.25}
      />
      <text x={b.x + 16} y={b.y + 24} fontWeight={600} fill={INK}>
        {b.name}
      </text>
      {b.lines.map((line, i) => (
        <text key={line} x={b.x + 16} y={b.y + 42 + i * 16} fontSize={11.5} fill={b.accent ? INK : QUIET}>
          {line}
        </text>
      ))}
    </g>
  );
}

/** Where the stock numbers come from: every source writes movements, and movements make the balance. */
export default function InventoryAndWarehouseDiagram() {
  return (
    <svg
      viewBox="0 0 760 460"
      role="img"
      aria-label="Every change to stock is a movement, and the movements make the balance"
      fontSize={13}
    >
      <defs>
        <marker id="m-inventory-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        Every change to stock is a movement, and the movements make the balance
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        {SOURCES.map((s, i) => (
          <path
            key={s.name}
            d={`M${SX + SW} ${s.y + s.h / 2}H${SX + SW + 8 + i * 5}V${LEDGER.y + 12 + i * 17}H${LX}`}
            markerEnd="url(#m-inventory-arrow)"
          />
        ))}
        <path d={`M${LX + LW} ${LEDGER.y + LEDGER.h / 2}H${RX}`} markerEnd="url(#m-inventory-arrow)" />
        <path d={`M${RX + RW / 2} ${BALANCE.y + BALANCE.h}V${AVAILABLE.y}`} markerEnd="url(#m-inventory-arrow)" />
      </g>

      {SOURCES.map((s) => (
        <BoxShape key={s.name} b={s} />
      ))}
      <BoxShape b={LEDGER} />
      <BoxShape b={BALANCE} />
      <BoxShape b={AVAILABLE} />
    </svg>
  );
}
