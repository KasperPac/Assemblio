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
  { y: 64, h: 56, role: "Shopify, or admin", name: "Product", lines: ["Imported from Shopify, or a retail item"] },
  { y: 152, h: 56, role: "Shopify", name: "Variant", lines: ["Each has a SKU and a sell price"] },
  { y: 240, h: 56, role: "Admin", name: "Draft BOM", lines: ["Add components, copy a BOM or use a template"] },
  {
    y: 328,
    h: 72,
    role: "Live",
    name: "Active BOM",
    lines: ["Components and a labour routing", "Read-only. Edit BOM starts a new draft"],
    accent: true,
  },
  { y: 432, h: 56, role: "History", name: "Older versions", lines: ["Kept under Versions; Make active restores it"] },
];

/** Product to live BOM: one live BOM per variant, changes through a draft, and the retail shortcut. */
export default function ProductsAndBomsDiagram() {
  return (
    <svg viewBox="0 0 760 512" role="img" aria-label="A variant has one live BOM, and changes go through a draft" fontSize={13}>
      <defs>
        <marker id="m-products-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        A variant has one live BOM, and changes go through a draft
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        {[120, 208, 296, 400].map((y0, i) => (
          <path key={y0} d={`M${CX} ${y0}V${[152, 240, 328, 432][i]}`} markerEnd="url(#m-products-arrow)" />
        ))}
        <path d={`M${L + W} 180H${SX + SW / 2}V328`} markerEnd="url(#m-products-arrow)" />
        <path d={`M${SX} 364H${L + W}`} markerEnd="url(#m-products-arrow)" />
      </g>
      <text x={CX + 12} y={316} fontSize={11.5} fill={QUIET}>
        Activate BOM
      </text>
      <text x={CX + 12} y={420} fontSize={11.5} fill={QUIET}>
        A newer version goes live
      </text>
      <text x={L + W + 12} y={170} fontSize={11.5} fill={QUIET}>
        Track as retail item
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

      <rect x={SX} y={328} width={SW} height={72} rx={8} fill="var(--bg-card)" stroke={EDGE} strokeWidth={1.25} />
      <text x={SX + 16} y={352} fontWeight={600} fill={INK}>
        Retail item
      </text>
      <text x={SX + 16} y={368} fontSize={11.5} fill={QUIET}>
        Bought in, sold unchanged
      </text>
      <text x={SX + 16} y={384} fontSize={11.5} fill={QUIET}>
        One-line BOM, quantity 1
      </text>
    </svg>
  );
}
