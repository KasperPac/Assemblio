"use client";

import { useMemo, useState } from "react";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import styles from "./activity-log.module.css";

type LogRow = {
  id: string;
  event: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
};

type Props = {
  rows: LogRow[];
  error?: string;
};

function getEventVariant(event: string) {
  const normalized = event.toLowerCase();
  if (normalized.includes("delete") || normalized.includes("disconnect")) return "danger";
  if (normalized.includes("sync") || normalized.includes("update")) return "info";
  if (normalized.includes("create") || normalized.includes("restore")) return "success";
  return "default";
}

export default function ActivityLogClient({ rows, error }: Props) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState("all");

  const users = useMemo(() => {
    const unique = new Set<string>();
    for (const row of rows) {
      unique.add((row.metadata?.user as string | undefined) ?? "Shopify");
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const events = useMemo(() => {
    const unique = new Set<string>();
    for (const row of rows) {
      unique.add(row.event);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const createdDateIso = row.created_at.slice(0, 10);
      const user = ((row.metadata?.user as string | undefined) ?? "Shopify").toLowerCase();
      const entity = ((row.metadata?.entity as string | undefined) ?? "component").toLowerCase();
      const message = ((row.metadata?.message as string | undefined) ?? row.event).toLowerCase();
      const event = row.event.toLowerCase();

      if (selectedUser !== "all" && user !== selectedUser.toLowerCase()) return false;
      if (selectedEvent !== "all" && event !== selectedEvent.toLowerCase()) return false;
      if (dateFrom && createdDateIso < dateFrom) return false;
      if (dateTo && createdDateIso > dateTo) return false;
      if (!query) return true;

      return (
        event.includes(query) ||
        entity.includes(query) ||
        message.includes(query) ||
        user.includes(query) ||
        createdDateIso.includes(query)
      );
    });
  }, [rows, search, selectedUser, selectedEvent, dateFrom, dateTo]);

  const selected = useMemo(() => {
    return filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? undefined;
  }, [filteredRows, selectedId]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Audit"
        title="Activity log"
        description="Search recent platform activity, inspect event details, and review the raw metadata recorded for each action."
      />

      <div className={styles.filters}>
        <input
          aria-label="Search activity"
          placeholder="Search messages, users, entities..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          aria-label="From date"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <input
          aria-label="To date"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />
        <select
          value={selectedUser}
          onChange={(event) => setSelectedUser(event.target.value)}
        >
          <option value="all">All users</option>
          {users.map((user) => (
            <option key={user} value={user}>
              {user}
            </option>
          ))}
        </select>
        <select
          value={selectedEvent}
          onChange={(event) => setSelectedEvent(event.target.value)}
        >
          <option value="all">All events</option>
          {events.map((eventName) => (
            <option key={eventName} value={eventName}>
              {eventName}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.content}>
        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <span>Date</span>
            <span>User</span>
            <span>Event</span>
            <span>Entity</span>
            <span>Message</span>
          </div>
          {error ? (
            <EmptyState title="Failed to load activity" message={error} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              title="No activity found"
              message="Try widening the filters or search term to inspect more events."
            />
          ) : (
            filteredRows.map((row) => {
              const entity = (row.metadata?.entity as string | undefined) ?? "component";
              const message = (row.metadata?.message as string | undefined) ?? row.event;
              const user = (row.metadata?.user as string | undefined) ?? "Shopify";
              const isActive = row.id === selected?.id;
              return (
                <button
                  type="button"
                  key={row.id}
                  className={isActive ? styles.tableRowActive : styles.tableRow}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className={styles.meta}>
                    {new Date(row.created_at).toLocaleDateString("en-GB")}{" "}
                    {new Date(row.created_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>{user}</span>
                  <StatusBadge variant={getEventVariant(row.event)}>{row.event}</StatusBadge>
                  <span>{entity}</span>
                  <span>{message}</span>
                </button>
              );
            })
          )}
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
                {((selected?.metadata?.user as string | undefined) ?? "S").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p>{(selected?.metadata?.user as string) ?? "Shopify"}</p>
                <span>{selected?.actor_id ?? "System actor"}</span>
              </div>
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Entity</p>
            <div className={styles.detailBox}>
              {(selected?.metadata?.entity as string) ?? "component"}
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Message</p>
            <p className={styles.detailMessage}>
              {(selected?.metadata?.message as string) ?? "Activity logged"}
            </p>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Raw metadata</p>
            <pre className={styles.detailCode}>
              {JSON.stringify(selected?.metadata ?? {}, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
