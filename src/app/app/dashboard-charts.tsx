"use client";

type TimelinePoint = {
  label: string;
  placed: number;
  fulfilled: number;
  cancelled: number;
};

type ProductPoint = {
  title: string;
  count: number;
};

type OrderTrendChartProps = {
  data: TimelinePoint[];
};

type TopProductsChartProps = {
  data: ProductPoint[];
};

const PIE_COLORS = ["#4ade80", "#fbbf24", "#60a5fa", "#a78bfa", "#f472b6"];

export function OrderTrendChart({ data }: OrderTrendChartProps) {
  const width = 760;
  const height = 240;
  const margin = { top: 20, right: 20, bottom: 30, left: 20 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    1,
    ...data.map((row) => Math.max(row.placed, row.fulfilled, row.cancelled))
  );

  function toPath(values: number[]) {
    if (values.length === 0) return "";
    const points = values.map((value, index) => {
      const x =
        margin.left +
        (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
      const y = margin.top + innerHeight - (value / maxValue) * innerHeight;
      return { x, y };
    });

    if (points.length < 2) return `M${points[0].x},${points[0].y}`;

    let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }
    return path;
  }

  function toAreaPath(values: number[]) {
    const linePath = toPath(values);
    if (!linePath) return "";
    const points = values.map((value, index) => {
      const x =
        margin.left +
        (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
      return x;
    });
    const lastX = points[points.length - 1];
    const firstX = points[0];
    const bottom = margin.top + innerHeight;
    return `${linePath} L${lastX.toFixed(1)},${bottom} L${firstX.toFixed(1)},${bottom} Z`;
  }

  const fulfilledPath = toPath(data.map((row) => row.fulfilled));
  const fulfilledArea = toAreaPath(data.map((row) => row.fulfilled));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="240"
      role="img"
      aria-label="Order fulfillment trend"
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((fraction) => {
        const y = margin.top + innerHeight - innerHeight * fraction;
        return (
          <line
            key={fraction}
            x1={margin.left}
            y1={y}
            x2={width - margin.right}
            y2={y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}

      {/* Area fill */}
      <path d={fulfilledArea} fill="url(#areaGrad)" />

      {/* Line */}
      <path d={fulfilledPath} fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" />

      {/* Dots */}
      {data.map((row, index) => {
        const x =
          margin.left +
          (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
        const y = margin.top + innerHeight - (row.fulfilled / maxValue) * innerHeight;
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="3"
            fill="#4ade80"
            stroke="#141a2a"
            strokeWidth="2"
          />
        );
      })}

      {/* X-axis labels */}
      {data.map((row, index) => {
        const x =
          margin.left +
          (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
        return (
          <text
            key={index}
            x={x}
            y={height - 4}
            textAnchor="middle"
            fill="#6b7a8d"
            fontSize="10"
            fontFamily="inherit"
          >
            {row.label}
          </text>
        );
      })}
    </svg>
  );
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  const safeData = data.length > 0 ? data : [{ title: "No Orders", count: 1 }];
  const total = safeData.reduce((sum, row) => sum + row.count, 0) || 1;
  const segments = safeData.reduce<
    Array<{
      key: string;
      start: number;
      end: number;
      color: string;
      title: string;
    }>
  >((acc, entry, index) => {
    const lastEnd = acc.length === 0 ? 0 : acc[acc.length - 1].end;
    const end = lastEnd + entry.count / total;
    acc.push({
      key: `${entry.title}-${index}`,
      start: lastEnd,
      end,
      color: PIE_COLORS[index % PIE_COLORS.length],
      title: entry.title,
    });
    return acc;
  }, []);

  const topEntry = safeData[0];
  const topCount = topEntry.count;

  return (
    <svg viewBox="0 0 220 220" width="100%" height="220" role="img" aria-label="Top products distribution">
      {/* Donut segments */}
      {segments.map((segment) => (
        <circle
          key={segment.key}
          cx="110"
          cy="110"
          r="64"
          fill="none"
          stroke={segment.color}
          strokeWidth="24"
          strokeDasharray={`${Math.max((segment.end - segment.start) * 402 - 3, 0)} 402`}
          strokeDashoffset={-segment.start * 402}
          transform="rotate(-90 110 110)"
          strokeLinecap="round"
        >
          <title>{segment.title}</title>
        </circle>
      ))}
      {/* Center bg */}
      <circle cx="110" cy="110" r="48" fill="#141a2a" />
      {/* Center text */}
      <text x="110" y="105" textAnchor="middle" fill="#f0f2f5" fontSize="22" fontWeight="800" fontFamily="inherit">
        {topCount > 999 ? `${(topCount / 1000).toFixed(1)}k` : topCount}
      </text>
      <text x="110" y="124" textAnchor="middle" fill="#6b7a8d" fontSize="10" fontFamily="inherit">
        Top Product
      </text>
    </svg>
  );
}
