// src/lib/accounting/outbox/process.ts
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logSystemActivity } from "@/lib/activity/log";
import { xeroAccessFor } from "../xero/access";
import type { XeroAccess } from "../xero/client";
import { isXeroPilotTenant } from "../xero/config";
import { scrubSecrets } from "../xero/scrub";
import { XeroAuthError, supabaseCredentialStore } from "../xero/tokens";
import {
  createOrgCache, handleCreateBill, handleCreateContact, handleVoidBill, supabaseHandlerStore,
  type HandlerOutcome, type HandlerStore, type JobContext, type OutboxJob,
} from "./handlers";
import { invoiceSyncStatusFor, isFailedForGood, nextJobState, type JobUpdate } from "./state";

type Handler = (job: OutboxJob, ctx: JobContext) => Promise<HandlerOutcome>;
const HANDLERS: Record<OutboxJob["operation"], Handler> = {
  create_contact: handleCreateContact,
  create_bill: handleCreateBill,
  void_bill: handleVoidBill,
};

export type ProcessDeps = {
  db: SupabaseClient;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  getAccess?: (c: { id: string; external_org_id: string }) => Promise<XeroAccess>;
  store?: HandlerStore;
  handlers?: Partial<Record<OutboxJob["operation"], Handler>>;
  worker?: string;
  /** Pilot allowlist check (spec section 9). Defaults to XERO_PILOT_TENANTS. */
  isPilotTenant?: (tenantId: string) => boolean;
  /** Absolute epoch ms by which this run must stop starting work (set by processOutbox). */
  deadlineAt?: number;
};
export type ProcessResult = { claimed: number; sent: number; failed: number };

/** claim_accounting_jobs reclaims a `working` job after 5 minutes, so a run must finish well inside that. */
export const RUN_BUDGET_MS = 45_000;
/** Do not start another job with less than this left: a handler can make several Xero calls. */
export const MIN_JOB_WINDOW_MS = 10_000;

const AUTH_OUTCOME: HandlerOutcome = {
  kind: "error",
  error: { errorClass: "auth", message: "Xero needs reconnecting. An admin can reconnect it from Settings → Integrations.", detail: null, retryAfterSec: null },
};

const scrubbed = (err: unknown) => String(scrubSecrets(err instanceof Error ? err.message : String(err)));

function thrownOutcome(err: unknown): HandlerOutcome {
  if (err instanceof XeroAuthError) return AUTH_OUTCOME;
  return {
    kind: "error",
    error: {
      errorClass: "transient",
      message: "Something went wrong sending this to Xero. Manuva will retry.",
      detail: scrubSecrets(err instanceof Error ? err.message : String(err)),
      retryAfterSec: null,
    },
  };
}

/**
 * Records an outcome. The write only lands while the job is still ours and still `working`: disconnect and
 * org change cancel `working` jobs mid-flight, and a completion must never resurrect one. Returns null
 * (and writes nothing else) when the job was cancelled or reclaimed.
 */
async function finish(db: SupabaseClient, job: OutboxJob, outcome: HandlerOutcome, now: Date, worker: string): Promise<JobUpdate | null> {
  const raw = nextJobState(job, outcome, now);
  const update: JobUpdate = { ...raw, error_message: raw.error_message === null ? null : String(scrubSecrets(raw.error_message)), error_detail: scrubSecrets(raw.error_detail) };
  const { data, error } = await db
    .from("accounting_outbox")
    .update(update)
    .eq("id", job.id)
    .eq("status", "working")
    .eq("locked_by", worker)
    .select("id");
  assertNoError(error, "update accounting_outbox");
  if (!data || data.length === 0) {
    console.error("[xero] outbox job was cancelled or reclaimed mid-flight; outcome not recorded", job.id, job.operation);
    return null;
  }

  const sync = invoiceSyncStatusFor(job.operation, update);
  if (sync && job.entity_type === "supplier_invoice") {
    const { error: e2 } = await db.from("supplier_invoice").update({ sync_status: sync, updated_at: now.toISOString() }).eq("id", job.entity_id);
    assertNoError(e2, "mirror supplier_invoice sync_status");
  }
  const failedForGood = isFailedForGood(update);
  if (job.operation === "create_contact" && failedForGood) {
    // Bills waiting on this contact can't go either; show them as failed.
    const { data: dependants, error: e3 } = await db.from("accounting_outbox").select("entity_id").eq("depends_on", job.id).in("status", ["pending", "failed"]);
    assertNoError(e3, "read dependent outbox jobs");
    const ids = (dependants ?? []).map((d) => (d as { entity_id: string }).entity_id);
    if (ids.length) {
      const { error: e4 } = await db.from("supplier_invoice").update({ sync_status: "failed", updated_at: now.toISOString() }).in("id", ids);
      assertNoError(e4, "mark dependent invoices failed");
    }
  }
  if (failedForGood) {
    await logSystemActivity({
      supabase: db, tenantId: job.tenant_id, actorType: "system", actorLabel: "Xero sync",
      event: update.status === "gave_up" ? "accounting.sync_gave_up" : "accounting.sync_failed",
      entityId: job.id, metadata: { operation: job.operation, message: update.error_message },
    });
  }
  if (update.status === "sent" && job.operation === "create_bill" && job.entity_type === "supplier_invoice") {
    const note = update.error_detail && typeof update.error_detail === "object" ? (update.error_detail as { adopted?: unknown; rounding?: unknown }) : {};
    await logSystemActivity({
      supabase: db, tenantId: job.tenant_id, actorType: "system", actorLabel: "Xero sync",
      event: "accounting.bill_sent", entityId: job.entity_id,
      metadata: {
        ...(note.adopted !== undefined ? { adopted: note.adopted } : {}),
        ...(note.rounding !== undefined ? { rounding: note.rounding } : {}),
      },
    });
  }
  return update;
}

/** Returns claimed-but-unrun jobs to `pending`. Conditional so it can't touch a job another worker now owns. */
async function releaseJobs(db: SupabaseClient, ids: string[], nextAt: string, worker: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await db
    .from("accounting_outbox")
    .update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: nextAt })
    .in("id", ids)
    .eq("status", "working")
    .eq("locked_by", worker);
  assertNoError(error, "release accounting_outbox jobs");
}

/** Spec section 7: a daily limit stops the whole organisation, so every retryable job waits for the same time. */
async function deferConnection(db: SupabaseClient, connectionId: string, nextAt: string): Promise<void> {
  const { error } = await db
    .from("accounting_outbox")
    .update({ next_attempt_at: nextAt })
    .eq("connection_id", connectionId)
    .or("status.eq.pending,and(status.eq.failed,error_class.eq.transient)")
    .lt("next_attempt_at", nextAt);
  assertNoError(error, "defer accounting_outbox jobs");
}

export async function processConnectionOutbox(
  connectionId: string,
  deps: ProcessDeps,
  limit = 25,
  budgetMs = RUN_BUDGET_MS
): Promise<ProcessResult> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const worker = deps.worker ?? `w-${randomUUID()}`;
  const result: ProcessResult = { claimed: 0, sent: 0, failed: 0 };
  const deadline = Math.min(now().getTime() + Math.min(budgetMs, RUN_BUDGET_MS), deps.deadlineAt ?? Infinity);
  const timeLeft = () => deadline - now().getTime();
  if (timeLeft() < MIN_JOB_WINDOW_MS) return result;

  const { data: conn, error: connErr } = await db.from("accounting_connection").select("id, tenant_id, external_org_id, status").eq("id", connectionId).maybeSingle();
  assertNoError(connErr, "load accounting_connection");
  const c = conn as { id: string; tenant_id: string; external_org_id: string; status: string } | null;
  if (!c || c.status !== "connected") return result;
  if (!(deps.isPilotTenant ?? ((t: string) => isXeroPilotTenant(t)))(c.tenant_id)) return result;

  const { data: claimed, error } = await db.rpc("claim_accounting_jobs", { p_connection_id: connectionId, p_limit: limit, p_worker: worker });
  assertNoError(error, "claim_accounting_jobs");
  const jobs = (claimed ?? []) as OutboxJob[];
  result.claimed = jobs.length;
  if (!jobs.length) return result;

  let access: XeroAccess;
  try {
    access = await (deps.getAccess ?? ((x) => xeroAccessFor(db, x)))(c);
  } catch (err) {
    const outcome = thrownOutcome(err);
    for (const job of jobs) {
      if (await finish(db, job, outcome, now(), worker)) result.failed++;
    }
    if (outcome === AUTH_OUTCOME) await supabaseCredentialStore(db).markNeedsReconnect(connectionId, "Xero needs reconnecting");
    return result;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const ctx: JobContext = { store: deps.store ?? supabaseHandlerStore(db), access, fetchImpl, cache: createOrgCache(access, fetchImpl) };
  const handlers = { ...HANDLERS, ...deps.handlers };

  for (let i = 0; i < jobs.length; i++) {
    if (timeLeft() < MIN_JOB_WINDOW_MS) {
      // Out of time: hand the rest back now rather than leave them `working` for the stale-lease reclaim.
      await releaseJobs(db, jobs.slice(i).map((j) => j.id), now().toISOString(), worker);
      break;
    }
    const job = jobs[i];
    let outcome: HandlerOutcome;
    try {
      outcome = await handlers[job.operation](job, ctx);
    } catch (err) {
      outcome = thrownOutcome(err);
    }
    const update = await finish(db, job, outcome, now(), worker);
    if (update) {
      if (update.status === "sent") result.sent++;
      else result.failed++;
    }
    if (outcome.kind === "error" && (outcome.error.errorClass === "auth" || outcome.error.errorClass === "daily_limit")) {
      // Nothing else for this organisation can succeed now: return the rest without spending an attempt.
      const nextAt = update?.next_attempt_at ?? nextJobState(job, outcome, now()).next_attempt_at;
      await releaseJobs(db, jobs.slice(i + 1).map((j) => j.id), nextAt, worker);
      if (outcome.error.errorClass === "daily_limit") await deferConnection(db, connectionId, nextAt);
      if (outcome.error.errorClass === "auth") await supabaseCredentialStore(db).markNeedsReconnect(connectionId, outcome.error.message);
      break;
    }
  }
  return result;
}

/** The cron entry: every connection with due work, inside one run budget. Pilot gating happens per connection. */
export async function processOutbox(deps: ProcessDeps, budgetMs = RUN_BUDGET_MS): Promise<ProcessResult & { connections: number }> {
  const now = deps.now ?? (() => new Date());
  const deadlineAt = now().getTime() + Math.min(budgetMs, RUN_BUDGET_MS);
  const { data, error } = await deps.db
    .from("accounting_outbox")
    .select("connection_id")
    .in("status", ["pending", "failed", "working"])
    .lte("next_attempt_at", now().toISOString())
    .limit(1000);
  assertNoError(error, "list due accounting_outbox");
  const ids = [...new Set((data ?? []).map((r) => (r as { connection_id: string }).connection_id))];
  const total = { claimed: 0, sent: 0, failed: 0, connections: 0 };
  for (const id of ids) {
    if (deadlineAt - now().getTime() < MIN_JOB_WINDOW_MS) break;
    try {
      const r = await processConnectionOutbox(id, { ...deps, deadlineAt });
      total.claimed += r.claimed;
      total.sent += r.sent;
      total.failed += r.failed;
      total.connections++;
    } catch (err) {
      console.error("[xero] outbox run failed", id, scrubbed(err));
    }
  }
  return total;
}

/** Same as processOutbox; the name the brief gave it. */
export const processDueOutboxes = processOutbox;

/** Called from after() in server actions. Never throws. Pilot-gated like the cron path. */
export async function kickOutbox(target: { connectionId: string } | { tenantId: string }, deps?: Partial<ProcessDeps>): Promise<void> {
  try {
    const db = deps?.db ?? createSupabaseAdminClient();
    let connectionId: string | null = "connectionId" in target ? target.connectionId : null;
    if (!connectionId) {
      const { data, error } = await db
        .from("accounting_connection")
        .select("id")
        .eq("tenant_id", (target as { tenantId: string }).tenantId)
        .eq("provider", "xero")
        .eq("status", "connected")
        .maybeSingle();
      assertNoError(error, "find connection to kick");
      connectionId = (data as { id: string } | null)?.id ?? null;
    }
    if (connectionId) await processConnectionOutbox(connectionId, { ...deps, db }, 5);
  } catch (err) {
    console.error("[xero] kickOutbox failed", scrubbed(err));
  }
}
