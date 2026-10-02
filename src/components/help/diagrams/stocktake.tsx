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
  { y: 64, h: 56, role: "Anyone", name: "1  Start a session", lines: ["Choose a location and a count type"] },
  { y: 152, h: 56, role: "Anyone", name: "2  Count", lines: ["On screen, on a phone or by CSV import"] },
  { y: 240, h: 56, role: "Anyone", name: "3  Submit for review", lines: ["Every line needs a count"] },
  { y: 328, h: 56, role: "Admins", name: "4  Review variances", lines: ["Give each a reason, or send back to recount"] },
  {
    y: 432,
    h: 72,
    role: "Admins",
    name: "5  Approve and apply",
    lines: ["On hand is set to each counted figure", "One movement per line that changed"],
    accent: true,
  },
];

/** A stocktake from session to commit, and where an initial count skips ahead. */
export default function StocktakeDiagram() {
  return (
    <svg viewBox="0 0 760 530" role="img" aria-label="Counting changes nothing; stock moves only when the count is applied" fontSize={13}>
      <defs>
        <marker id="m-stocktake-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        Counting changes nothing; stock moves only when the count is applied
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        {[120, 208, 296, 384].map((y0, i) => (
          <path key={y0} d={`M${CX} ${y0}V${[152, 240, 328, 432][i]}`} markerEnd="url(#m-stocktake-arrow)" />
        ))}
        <path d={`M${L + W} 180H${SX + SW / 2}V240`} markerEnd="url(#m-stocktake-arrow)" />
        <path d={`M${SX + SW / 2} 296V468H${L + W}`} markerEnd="url(#m-stocktake-arrow)" />
      </g>
      <text x={L + W + 12} y={170} fontSize={11.5} fill={QUIET}>
        Initial count
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

      <rect x={SX} y={240} width={SW} height={56} rx={8} fill="var(--bg-card)" stroke={EDGE} strokeWidth={1.25} />
      <text x={SX + 16} y={264} fontWeight={600} fill={INK}>
        Apply opening stock
      </text>
      <text x={SX + 16} y={280} fontSize={11.5} fill={QUIET}>
        Skips review and approval
      </text>
    </svg>
  );
}
