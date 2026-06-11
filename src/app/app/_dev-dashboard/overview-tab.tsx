"use client";

import type { DashboardData } from "@/lib/dev-dashboard/types";

export default function OverviewTab({ data }: { data: DashboardData }) {
  return <div>Overview tab — {data.overview.health}</div>;
}
