"use client";

import { useCallback, useEffect, useState } from "react";
import { needsTokenExchange } from "./needs-token-exchange";
import styles from "./embedded.module.css";

type SessionResponse =
  | {
      status: "not-installed";
    }
  | {
      status: "no-subscription";
      tenantId: string;
      hasToken: boolean;
    }
  | {
      status: "past_due_locked";
      tenantId: string;
      hasToken: boolean;
    }
  | {
      status: "ok";
      tenantId: string;
      storeId: string;
      shopDomain: string;
      hasToken: boolean;
      lastSyncedAt: string | null;
      lastSyncStatus: string | null;
    };

type UiState =
  | { kind: "loading" }
  | { kind: "no-app-bridge" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: SessionResponse }
  | { kind: "syncing"; session: Extract<SessionResponse, { status: "ok" }> }
  | { kind: "synced"; session: Extract<SessionResponse, { status: "ok" }>; syncedAt: string };

// Subset of the modern App Bridge global API surface we use.
type AppBridgeGlobal = {
  idToken: () => Promise<string>;
};

function getAppBridge(): AppBridgeGlobal | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { shopify?: AppBridgeGlobal }).shopify;
  if (candidate && typeof candidate.idToken === "function") return candidate;
  return null;
}

async function waitForAppBridge(timeoutMs = 5000): Promise<AppBridgeGlobal | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const bridge = getAppBridge();
    if (bridge) return bridge;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function authenticatedFetch(path: string, init?: RequestInit): Promise<Response> {
  const bridge = getAppBridge();
  if (!bridge) throw new Error("app-bridge-unavailable");
  const token = await bridge.idToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

async function tryTokenExchange(): Promise<{ ok: boolean }> {
  try {
    const res = await authenticatedFetch("/api/shopify/embedded/token-exchange", {
      method: "POST",
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export default function EmbeddedClient({ shop: _shop }: { shop: string }) {
  const [ui, setUi] = useState<UiState>({ kind: "loading" });

  const loadSession = useCallback(async () => {
    setUi({ kind: "loading" });
    try {
      const bridge = await waitForAppBridge();
      if (!bridge) {
        setUi({ kind: "no-app-bridge" });
        return;
      }
      const res = await authenticatedFetch("/api/shopify/embedded/session", {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        setUi({ kind: "error", message: text || `HTTP ${res.status}` });
        return;
      }
      const session = (await res.json()) as SessionResponse;

      // If the shop is associated with a tenant but we don't yet have a token
      // (Shopify-managed install path skips our OAuth callback), exchange the
      // session token for an offline access token now, then re-read state.
      if (needsTokenExchange(session)) {
        await tryTokenExchange();
        const retryRes = await authenticatedFetch("/api/shopify/embedded/session", {
          method: "POST",
        });
        if (retryRes.ok) {
          const retrySession = (await retryRes.json()) as SessionResponse;
          setUi({ kind: "ready", session: retrySession });
          return;
        }
      }

      setUi({ kind: "ready", session });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown-error";
      setUi({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const runSync = useCallback(
    async (session: Extract<SessionResponse, { status: "ok" }>) => {
      setUi({ kind: "syncing", session });
      try {
        const res = await authenticatedFetch("/api/shopify/embedded/sync", {
          method: "POST",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; products: number; orders: number; orderLines: number }
          | { ok: false; error: string }
          | null;
        if (!res.ok || !json?.ok) {
          const message = json && "error" in json ? json.error : `HTTP ${res.status}`;
          setUi({ kind: "error", message });
          return;
        }
        setUi({ kind: "synced", session, syncedAt: new Date().toISOString() });
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync-failed";
        setUi({ kind: "error", message });
      }
    },
    []
  );

  return (
    <main className={styles.frame}>
      <section className={styles.card}>
        <h1 className={styles.title}>Manuva</h1>
        <p className={styles.subtitle}>Manufacturing operations for Shopify merchants</p>

        {ui.kind === "loading" && <p className={styles.body}>Loading&hellip;</p>}

        {ui.kind === "no-app-bridge" && (
          <p className={styles.body}>
            Couldn&apos;t reach Shopify App Bridge. Try refreshing this page from inside Shopify Admin.
          </p>
        )}

        {ui.kind === "error" && (
          <div className={styles.body}>
            <p className={styles.errorText}>Couldn&apos;t load your store details.</p>
            <p className={styles.muted}>Reason: {ui.message}</p>
            <button type="button" className={styles.primaryButton} onClick={loadSession}>
              Try again
            </button>
          </div>
        )}

        {ui.kind === "ready" && ui.session.status === "not-installed" && (
          <div className={styles.body}>
            <p>
              This Shopify store isn&apos;t connected to a Manuva account yet.
              Sign up for free at <strong>manuva.app</strong> and reinstall to start syncing.
            </p>
            <a className={styles.primaryButton} href="https://manuva.app/signup" target="_blank" rel="noreferrer">
              Sign up at manuva.app
            </a>
          </div>
        )}

        {ui.kind === "ready" && ui.session.status === "no-subscription" && (
          <div className={styles.body}>
            <p>
              Your Manuva account is connected, but you don&apos;t have an active subscription.
              Choose a plan on manuva.app to start syncing Shopify products and orders.
            </p>
            <a className={styles.primaryButton} href="https://manuva.app/pricing" target="_blank" rel="noreferrer">
              View Manuva pricing
            </a>
          </div>
        )}

        {ui.kind === "ready" && ui.session.status === "past_due_locked" && (
          <div className={styles.body}>
            <p>
              Your Manuva subscription is past due. Update your billing details on manuva.app to resume syncing.
            </p>
            <a className={styles.primaryButton} href="https://manuva.app/app/settings/billing" target="_blank" rel="noreferrer">
              Open billing settings
            </a>
          </div>
        )}

        {ui.kind === "ready" && ui.session.status === "ok" && (
          <ConnectedView session={ui.session} onSync={() => runSync(ui.session as Extract<SessionResponse, { status: "ok" }>)} />
        )}

        {ui.kind === "syncing" && (
          <ConnectedView session={ui.session} pending="Syncing&hellip;" disabled />
        )}

        {ui.kind === "synced" && (
          <ConnectedView
            session={ui.session}
            notice={`Sync queued at ${new Date(ui.syncedAt).toLocaleTimeString()}`}
            onSync={() => runSync(ui.session)}
          />
        )}
      </section>
    </main>
  );
}

function ConnectedView({
  session,
  onSync,
  pending,
  disabled,
  notice,
}: {
  session: Extract<SessionResponse, { status: "ok" }>;
  onSync?: () => void;
  pending?: string;
  disabled?: boolean;
  notice?: string;
}) {
  const lastSyncedLabel = session.lastSyncedAt
    ? new Date(session.lastSyncedAt).toLocaleString()
    : "Never";
  return (
    <div className={styles.body}>
      <dl className={styles.statusList}>
        <div className={styles.statusRow}>
          <dt>Store</dt>
          <dd>{session.shopDomain}</dd>
        </div>
        <div className={styles.statusRow}>
          <dt>Last synced</dt>
          <dd>{lastSyncedLabel}</dd>
        </div>
        <div className={styles.statusRow}>
          <dt>Last status</dt>
          <dd>{session.lastSyncStatus ?? "unknown"}</dd>
        </div>
      </dl>

      {notice && <p className={styles.notice}>{notice}</p>}

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onSync}
          disabled={disabled}
        >
          {pending ?? "Sync now"}
        </button>
        <a
          className={styles.secondaryButton}
          href="https://app.manuva.app/app"
          target="_blank"
          rel="noreferrer"
        >
          Open Manuva
        </a>
      </div>
    </div>
  );
}
