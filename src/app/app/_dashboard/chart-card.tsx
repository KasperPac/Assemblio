"use client";

import { useState, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import styles from "./chart-card.module.css";

export type ChartFormatter = "currency" | "count" | "days" | "units";

const FORMATTERS: Record<ChartFormatter, (v: number) => string> = {
  currency: (v) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}k`
    : `$${v.toFixed(0)}`,
  count: (v) => String(Math.round(v)),
  days: (v) => `${v.toFixed(1)}d`,
  units: (v) => String(Math.round(v)),
};

export type ChartSeries = { key: string; label: string; color: string };

export type ChartTabDef = {
  id: string;
  label: string;
  data: Record<string, number | string>[];
  xKey: string;
  series: ChartSeries[];
  formatter: ChartFormatter;
  multiLine?: boolean;
  emptyText?: string;
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--stroke-card)",
  borderRadius: "8px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.14)",
  fontSize: "12px",
  color: "var(--ink-strong)",
  padding: "8px 12px",
};

const LABEL_STYLE: React.CSSProperties = {
  color: "var(--ink-muted)",
  marginBottom: 4,
  fontSize: 11,
};

export function ChartCard({
  eyebrow,
  title,
  tabs,
}: {
  eyebrow: string;
  title: string;
  tabs: ChartTabDef[];
}) {
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tab = tabs[active];
  const fmt = FORMATTERS[tab.formatter];
  const hasData = tab.series.length > 0 && tab.data.some(d =>
    tab.series.some(s => Number(d[s.key] ?? 0) > 0)
  );
  const isMulti = (tab.multiLine ?? false) || tab.series.length > 1;
  const gradId = `cg-${tab.id}`;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h3 className={styles.title}>{title}</h3>
        </div>
        {tabs.length > 1 && (
          <div className={styles.tabGroup}>
            {tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(i)}
                className={`${styles.tab} ${active === i ? styles.tabActive : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.chartWrap}>
        {!mounted && <div className={styles.skeleton} />}
        {mounted && !hasData && (
          <div className={styles.empty}>
            <p>{tab.emptyText ?? "No data for this period."}</p>
          </div>
        )}
        {mounted && hasData && (
          <ResponsiveContainer width="100%" height={200}>
            {isMulti ? (
              <LineChart data={tab.data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-card)" vertical={false} />
                <XAxis
                  dataKey={tab.xKey}
                  tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => fmt(Number(v))}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={LABEL_STYLE}
                  formatter={(v) => fmt(Number(v)) as string}
                />
                {tab.series.map(s => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={tab.data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tab.series[0].color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={tab.series[0].color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-card)" vertical={false} />
                <XAxis
                  dataKey={tab.xKey}
                  tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => fmt(Number(v))}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={LABEL_STYLE}
                  formatter={(v) => fmt(Number(v)) as string}
                />
                <Area
                  type="monotone"
                  dataKey={tab.series[0].key}
                  name={tab.series[0].label}
                  stroke={tab.series[0].color}
                  strokeWidth={2.5}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {mounted && hasData && tab.series.length > 1 && (
        <div className={styles.legend}>
          {tab.series.map(s => (
            <span key={s.key} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
