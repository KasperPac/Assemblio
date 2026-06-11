"use client";

import type { BusinessData } from "@/lib/dev-dashboard/types";

export default function BusinessTab({ data }: { data: BusinessData }) {
  return <div>Business tab — MRR {data.mrr}</div>;
}
