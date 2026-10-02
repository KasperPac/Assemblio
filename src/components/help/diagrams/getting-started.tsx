const L = 176;
const W = 360;
const CX = L + W / 2;
const EDGE = "var(--ink-faint)";
const INK = "var(--ink-strong)";
const QUIET = "var(--ink-muted)";

type Step = { y: number; h: number; role: string; name: string; lines: string[]; accent?: boolean };

const STEPS: Step[] = [
  { y: 64, h: 56, role: "You", name: "1  Get an account", lines: ["Apply for access, then sign up from your invite"] },
  { y: 152, h: 56, role: "Admin", name: "2  Set up the company", lines: ["Name, timezone, currency and logo"] },
  { y: 240, h: 56, role: "Admin", name: "3  Invite your team", lines: ["Settings, Team: invite as Member or Admin"] },
  { y: 328, h: 56, role: "Admin", name: "4  Set the default location", lines: ["Add a warehouse, then Set as default"] },
  {
    y: 416,
    h: 72,
    role: "Admin",
    name: "5  Connect Shopify",
    lines: ["Settings, Integrations, Manage, Connect Shopify", "Then Sync to bring products and orders in"],
    accent: true,
  },
  {
    y: 520,
    h: 72,
    role: "Member or admin",
    name: "6  Add your first product",
    lines: ["Import Products brings in your Shopify catalogue", "New retail item (admin) adds a bought-in product"],
  },
];

/** The first hour: who does each step, in the order a new workspace meets them. */
export default function GettingStartedDiagram() {
  return (
    <svg viewBox="0 0 760 616" role="img" aria-label="An admin sets up the workspace, then products come in from Shopify" fontSize={13}>
      <defs>
        <marker id="m-getting-started-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        An admin sets up the workspace, then products come in from Shopify
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        {[120, 208, 296, 384, 488].map((y0, i) => (
          <path key={y0} d={`M${CX} ${y0}V${[152, 240, 328, 416, 520][i]}`} markerEnd="url(#m-getting-started-arrow)" />
        ))}
      </g>

      <text x={L + W + 12} y={360} fontSize={11.5} fill={QUIET}>
        Growth, Pro or trial
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
    </svg>
  );
}
