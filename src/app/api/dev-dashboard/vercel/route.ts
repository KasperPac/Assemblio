import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    return NextResponse.json({ deploys: [], note: "VERCEL_API_TOKEN or VERCEL_PROJECT_ID not configured" });
  }

  const res = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5&state=READY,ERROR&target=production`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ deploys: [], note: `Vercel API returned ${res.status}` });
  }

  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deploys = (data.deployments ?? []).map((d: any) => ({
    uid: d.uid,
    url: d.url,
    state: d.state ?? d.readyState,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : "",
    meta: {
      githubCommitMessage: d.meta?.githubCommitMessage ?? "",
      githubCommitRef: d.meta?.githubCommitRef ?? "",
    },
  }));

  return NextResponse.json({ deploys });
}
