"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import styles from "./report-chart.module.css";

export interface BarSeries {
  dataKey: string;
  color: string;
  name?: string;
}

interface BarProps {
  type: "bar";
  data: Record<string, unknown>[];
  series: BarSeries[];
  xKey: string;
  title: string;
  layout?: "horizontal" | "vertical";
}

interface LineProps {
  type: "line";
  data: Record<string, unknown>[];
  series: BarSeries[];
  xKey: string;
  title: string;
}

type Props = BarProps | LineProps;

export function ReportChart(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div className={styles.wrapper} style={{ minHeight: 244 }} />;

  return (
    <figure role="img" aria-label={props.title} style={{ margin: 0 }}>
      <div className={styles.wrapper}>
        <div className={styles.title}>{props.title}</div>
        <ResponsiveContainer width="100%" height={220}>
          {props.type === "bar" ? (
            <BarChart
              data={props.data}
              layout={props.layout ?? "horizontal"}
              margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-strong)" />
              {props.layout === "vertical" ? (
                <>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey={props.xKey} type="category" tick={{ fontSize: 11 }} width={120} />
                </>
              ) : (
                <>
                  <XAxis dataKey={props.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                </>
              )}
              <Tooltip />
              {props.series.length > 1 && <Legend />}
              {props.series.map((s) => (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  fill={s.color}
                  name={s.name ?? s.dataKey}
                  radius={props.layout === "vertical" ? [0, 2, 2, 0] : [2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart
              data={props.data}
              margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-strong)" />
              <XAxis dataKey={props.xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip />
              {props.series.length > 1 && <Legend />}
              {props.series.map((s) => (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  stroke={s.color}
                  dot={false}
                  name={s.name ?? s.dataKey}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
