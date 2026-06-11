"use client";

import type { InfraData } from "@/lib/dev-dashboard/types";

export default function InfraTab({ data }: { data: InfraData }) {
  return <div>Infrastructure tab — CPU {data.cpu}%</div>;
}
