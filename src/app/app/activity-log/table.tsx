"use client";

import { useMemo, useState } from "react";
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
    return (
      filteredRows.find((row) => row.id === selectedId) ??
      filteredRows[0] ??
      undefined
    );
  }, [filteredRows, selectedId]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Activity Log</h1>
          <p>System activity history</p>
        </div>
      </div>
      <div className={styles.filters}>
        <input
          placeholder="Search messages..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />
        <select
          value={selectedUser}
          onChange={(event) => setSelectedUser(event.target.value)}
        >
          <option value="all">All Users</option>
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
          <option value="all">All Events</option>
          {events.map((eventName) => (
            <option key={eventName} value={eventName}>
              {eventName}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.content}>
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <span>Date</span>
            <span>User</span>
            <span>Event Type</span>
            <span>Entity</span>
            <span>Message</span>
          </div>
          {error ? (
            <div className={styles.empty}>Failed to load activity.</div>
          ) : filteredRows.length === 0 ? (
            <div className={styles.empty}>No activity yet.</div>
          ) : (
            filteredRows.map((row) => {
              const entity =
                (row.metadata?.entity as string | undefined) ?? "component";
              const message =
                (row.metadata?.message as string | undefined) ?? row.event;
              const user =
                (row.metadata?.user as string | undefined) ?? "Shopify";
              const isActive = row.id === selected?.id;
              return (
                <button
                  type="button"
                  key={row.id}
                  className={isActive ? styles.tableRowActive : styles.tableRow}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span>
                    {new Date(row.created_at).toLocaleDateString("en-GB")}{" "}
                    {new Date(row.created_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>{user}</span>
                  <span>{row.event}</span>
                  <span>{entity}</span>
                  <span>{message}</span>
                </button>
              );
            })
          )}
        </div>
        <aside className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <h3>Log Details</h3>
            <button type="button" onClick={() => setSelectedId("")}>x</button>
          </div>
          <div className={styles.detailSection}>
            <p className={styles.detailTitle}>
              {selected?.event ?? "Log Entry"}
            </p>
          </div>
          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>User</p>
            <div className={styles.detailUser}>
              <span className={styles.avatar}>U</span>
              <div>
                <p>{(selected?.metadata?.user as string) ?? "User"}</p>
                <span>U</span>
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
            <p className={styles.detailLabel}>Raw Details</p>
            <pre className={styles.detailCode}>
{JSON.stringify(selected?.metadata ?? {}, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
