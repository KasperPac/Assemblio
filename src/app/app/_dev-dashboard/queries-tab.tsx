"use client";

import type { QueriesData } from "@/lib/dev-dashboard/types";

export default function QueriesTab({ data }: { data: QueriesData }) {
  return <div>Queries tab — {data.slowQueries.length} slow queries</div>;
}
