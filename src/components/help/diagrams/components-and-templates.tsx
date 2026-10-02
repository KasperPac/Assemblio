const W = 216;
const EDGE = "var(--ink-faint)";
const INK = "var(--ink-strong)";
const QUIET = "var(--ink-muted)";

type Box = { x: number; y: number; h: number; name: string; lines: string[]; accent?: boolean };

const BOXES: Box[] = [
  { x: 24, y: 64, h: 72, name: "Components", lines: ["Bought or made, and stocked", "Cost, reorder point, supplier"] },
  { x: 272, y: 64, h: 72, name: "Bill of materials (BOM)", lines: ["Components and labour", "needed to build one unit"] },
  { x: 520, y: 64, h: 72, name: "Products", lines: ["What you sell, from Shopify", "Each variant has a BOM"] },
  {
    x: 272,
    y: 200,
    h: 72,
    name: "Templates",
    lines: ["Reusable component packs", "and labour routings"],
    accent: true,
  },
  { x: 272, y: 336, h: 72, name: "Dynamic link (optional)", lines: ["Push template changes to", "the BOMs built from it"] },
];

/** Components feed BOMs, BOMs belong to products, templates are shortcuts for building BOMs. */
export default function ComponentsAndTemplatesDiagram() {
  return (
    <svg
      viewBox="0 0 760 432"
      role="img"
      aria-label="Components go into BOMs and BOMs belong to products; templates are saved starting points for BOMs"
      fontSize={13}
    >
      <defs>
        <marker id="m-components-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        Components go into BOMs; a template is a saved starting point for a BOM
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        <path d="M240 100H272" markerEnd="url(#m-components-arrow)" />
        <path d="M488 100H520" markerEnd="url(#m-components-arrow)" />
        <path d="M132 136V236H272" markerEnd="url(#m-components-arrow)" />
        <path d="M380 200V136" markerEnd="url(#m-components-arrow)" />
        <path d="M380 272V336" markerEnd="url(#m-components-arrow)" />
      </g>
      <text x={144} y={228} fontSize={11.5} fill={QUIET}>
        Packs hold them
      </text>
      <text x={392} y={172} fontSize={11.5} fill={QUIET}>
        Copied in when used
      </text>
      <text x={392} y={308} fontSize={11.5} fill={QUIET}>
        After you change a template
      </text>

      {BOXES.map((b) => (
        <g key={b.name}>
          <rect
            x={b.x}
            y={b.y}
            width={W}
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
            <text key={line} x={b.x + 16} y={b.y + 44 + i * 16} fontSize={11.5} fill={b.accent ? INK : QUIET}>
              {line}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}
