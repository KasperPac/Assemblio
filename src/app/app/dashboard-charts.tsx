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

const PIE_COLORS = ["#4e8dff", "#2ec5c5", "#ff6b92", "#ffd34f", "#9b7bff"];

export function OrderTrendChart({ data }: OrderTrendChartProps) {
  const width = 760;
  const height = 220;
  const margin = 20;
  const innerWidth = width - margin * 2;
  const innerHeight = height - margin * 2;
  const maxValue = Math.max(
    1,
    ...data.map((row) => Math.max(row.placed, row.fulfilled, row.cancelled))
  );

  function toPath(values: number[]) {
    if (values.length === 0) return "";
    return values
      .map((value, index) => {
        const x =
          margin +
          (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
        const y = margin + innerHeight - (value / maxValue) * innerHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const placedPath = toPath(data.map((row) => row.placed));
  const fulfilledPath = toPath(data.map((row) => row.fulfilled));
  const cancelledPath = toPath(data.map((row) => row.cancelled));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="220"
      role="img"
      aria-label="Placed, fulfilled, and cancelled orders trend"
    >
      {[0.25, 0.5, 0.75].map((fraction) => {
        const y = margin + innerHeight - innerHeight * fraction;
        return (
          <line
            key={fraction}
            x1={margin}
            y1={y}
            x2={width - margin}
            y2={y}
            stroke="#edf1f7"
            strokeWidth="1"
          />
        );
      })}

      <path d={placedPath} fill="none" stroke="#4e8dff" strokeWidth="3" strokeLinecap="round" />
      <path d={fulfilledPath} fill="none" stroke="#2ec5c5" strokeWidth="3" strokeLinecap="round" />
      <path d={cancelledPath} fill="none" stroke="#ff6b92" strokeWidth="3" strokeLinecap="round" />
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

  return (
    <svg viewBox="0 0 220 220" width="100%" height="220" role="img" aria-label="Top products distribution">
      {segments.map((segment) => (
        <circle
          key={segment.key}
          cx="110"
          cy="110"
          r="64"
          fill="none"
          stroke={segment.color}
          strokeWidth="30"
          strokeDasharray={`${Math.max((segment.end - segment.start) * 402 - 2, 0)} 402`}
          strokeDashoffset={-segment.start * 402}
          transform="rotate(-90 110 110)"
        >
          <title>{segment.title}</title>
        </circle>
      ))}
      <circle cx="110" cy="110" r="43" fill="#ffffff" />
    </svg>
  );
}
