"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import styles from "./activity-log.module.css";
import type { ActivityFilters } from "@/lib/activity/query";

type LogRow = {
  id: string;
  event: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_type: string;
  actor_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
};

type Props = {
  rows: LogRow[];
  error?: string;
  filters: ActivityFilters;
  eventOptions: string[];
  actorOptions: { id: string; label: string }[];
  page: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
};

function getEventVariant(event: string) {
  const n = event.toLowerCase();
  if (n.includes("delete") || n.includes("archived") || n.includes("uninstall") || n.includes("removed")) return "danger";
  if (n.includes("sync") || n.includes("updated") || n.includes("changed")) return "info";
  if (n.includes("created") || n.includes("restored") || n.includes("activated")) return "success";
  return "default";
}

const SYSTEM_ACTOR_LABEL: Record<string, string> = {
  shopify: "Shopify",
  stripe: "Stripe billing",
  system: "System",
};

function actorDisplay(row: LogRow): string {
  if (row.actor_type !== "user") return row.actor_label ?? SYSTEM_ACTOR_LABEL[row.actor_type] ?? "System";
  return row.actor_label ?? "Unknown user";
}

export default function ActivityLogClient(props: Props) {
  const { rows, error, filters, eventOptions, actorOptions, page, totalPages, totalCount } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? rows[0],
    [rows, selectedId]
  );

  function pushParams(next: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Audit"
        title="Activity log"
        description="Search and page through all platform activity, inspect event details, and review the raw metadata recorded for each action."
      />

      <div className={styles.filters}>
        <input
          aria-label="Search activity"
          placeholder="Search messages, users..."
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") pushParams({ q: searchDraft || null }); }}
          onBlur={() => { if ((filters.search ?? "") !== searchDraft) pushParams({ q: searchDraft || null }); }}
        />
        <input aria-label="From date" type="date" value={filters.dateFrom ?? ""} onChange={(e) => pushParams({ from: e.target.value || null })} />
        <input aria-label="To date" type="date" value={filters.dateTo ?? ""} onChange={(e) => pushParams({ to: e.target.value || null })} />
        <select value={filters.actorId ?? "all"} onChange={(e) => pushParams({ actor: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">All users</option>
          {actorOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select value={filters.event ?? "all"} onChange={(e) => pushParams({ event: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">All events</option>
          {eventOptions.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>

      <div className={styles.content}>
        <section className={styles.tableCard} data-pending={isPending ? "true" : undefined}>
          <div className={styles.tableHeader}>
            <span>Date</span><span>User</span><span>Event</span><span>Entity</span><span>Message</span>
          </div>
          {error ? (
            <EmptyState title="Failed to load activity" message={error} />
          ) : rows.length === 0 ? (
            <EmptyState title="No activity found" message="Try widening the filters or search term to inspect more events." />
          ) : (
            rows.map((row) => {
              const isActive = row.id === selected?.id;
              const isSystem = row.actor_type !== "user";
              return (
                <button
                  type="button"
                  key={row.id}
                  className={isActive ? styles.tableRowActive : styles.tableRow}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className={styles.meta}>
                    {new Date(row.created_at).toLocaleDateString("en-GB")}{" "}
                    {new Date(row.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>
                    {actorDisplay(row)}
                    {isSystem && <span className={styles.systemChip}>auto</span>}
                  </span>
                  <StatusBadge variant={getEventVariant(row.event)}>{row.event}</StatusBadge>
                  <span>{row.entity_type ?? "—"}</span>
                  <span>{row.summary ?? row.event}</span>
                </button>
              );
            })
          )}

          <div className={styles.pagination}>
            <span className={styles.meta}>
              {totalCount} event{totalCount === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1 || isPending}
                onClick={() => pushParams({ page: String(page - 1) }, false)}
              >
                ← Prev
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages || isPending}
                onClick={() => pushParams({ page: String(page + 1) }, false)}
              >
                Next →
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <p className={styles.eyebrow}>Selected event</p>
              <h2>{selected?.event ?? "Log entry"}</h2>
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Operator</p>
            <div className={styles.detailUser}>
              <span className={styles.avatar}>
                {(selected ? actorDisplay(selected) : "?").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p>{selected ? actorDisplay(selected) : "—"}</p>
                <span>{selected?.actor_type === "user" ? (selected?.actor_id ?? "—") : "Automated"}</span>
              </div>
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Entity</p>
            <div className={styles.detailBox}>
              {selected?.entity_type ?? "—"}
              {selected?.entity_id ? ` · ${selected.entity_id}` : ""}
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Message</p>
            <p className={styles.detailMessage}>{selected?.summary ?? "Activity logged"}</p>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Raw metadata</p>
            <pre className={styles.detailCode}>{JSON.stringify(selected?.metadata ?? {}, null, 2)}</pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
