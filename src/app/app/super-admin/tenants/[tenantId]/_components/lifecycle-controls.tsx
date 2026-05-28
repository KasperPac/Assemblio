"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  suspendTenant,
  unsuspendTenant,
  softDeleteTenant,
  restoreTenant,
  extendTrial,
  changePlan,
} from "../actions";
import styles from "./lifecycle-controls.module.css";

type Props = {
  tenantId: string;
  tenantName: string;
  isSuspended: boolean;
  isDeleted: boolean;
  currentTier: string | null;
  currentStatus: string | null;
  currentTrialEndsAt: string | null;
};

type ModalKind = null | "suspend" | "delete" | "extend" | "plan";

export default function LifecycleControls(props: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalKind>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setModal(null);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.actions}>
        {!props.isSuspended && !props.isDeleted && (
          <button onClick={() => setModal("suspend")}>Suspend</button>
        )}
        {props.isSuspended && (
          <button onClick={() => run(() => unsuspendTenant({ tenantId: props.tenantId }))}>
            Unsuspend
          </button>
        )}
        {!props.isDeleted && <button onClick={() => setModal("extend")}>Extend trial</button>}
        {!props.isDeleted && <button onClick={() => setModal("plan")}>Change plan</button>}
        {!props.isDeleted && (
          <button onClick={() => setModal("delete")} className={styles.danger}>
            Delete
          </button>
        )}
        {props.isDeleted && (
          <button onClick={() => run(() => restoreTenant({ tenantId: props.tenantId }))}>
            Restore
          </button>
        )}
      </div>

      {modal === "suspend" && (
        <ConfirmModal
          title="Suspend tenant"
          confirmLabel="Suspend"
          tenantName={props.tenantName}
          requireTypedName
          onCancel={() => setModal(null)}
          onSubmit={(fd) =>
            run(() =>
              suspendTenant({ tenantId: props.tenantId, reason: String(fd.get("reason") ?? "") })
            )
          }
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" required rows={2} />
          </label>
        </ConfirmModal>
      )}

      {modal === "delete" && (
        <ConfirmModal
          title="Soft-delete tenant"
          confirmLabel="Delete"
          tenantName={props.tenantName}
          requireTypedName
          onCancel={() => setModal(null)}
          onSubmit={(fd) =>
            run(() =>
              softDeleteTenant({ tenantId: props.tenantId, reason: String(fd.get("reason") ?? "") })
            )
          }
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" required rows={2} />
          </label>
          <p className={styles.warn}>
            Soft-delete sets deleted_at. Members will be locked out. Reversible via Restore.
          </p>
        </ConfirmModal>
      )}

      {modal === "extend" && (
        <ConfirmModal
          title="Extend trial"
          confirmLabel="Extend"
          tenantName={props.tenantName}
          onCancel={() => setModal(null)}
          onSubmit={(fd) =>
            run(() =>
              extendTrial({
                tenantId: props.tenantId,
                newTrialEndsAt: new Date(String(fd.get("newTrialEndsAt"))).toISOString(),
                reason: String(fd.get("reason") ?? ""),
              })
            )
          }
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>New trial end</span>
            <input
              type="datetime-local"
              name="newTrialEndsAt"
              required
              defaultValue={
                props.currentTrialEndsAt
                  ? new Date(props.currentTrialEndsAt).toISOString().slice(0, 16)
                  : ""
              }
            />
          </label>
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" rows={2} />
          </label>
        </ConfirmModal>
      )}

      {modal === "plan" && (
        <ConfirmModal
          title="Change plan"
          confirmLabel="Apply"
          tenantName={props.tenantName}
          onCancel={() => setModal(null)}
          onSubmit={(fd) =>
            run(() =>
              changePlan({
                tenantId: props.tenantId,
                selected_tier: (fd.get("selected_tier") || undefined) as any,
                status: (fd.get("status") || undefined) as any,
                reason: String(fd.get("reason") ?? ""),
              })
            )
          }
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>Tier</span>
            <select name="selected_tier" defaultValue={props.currentTier ?? ""}>
              <option value="">(unchanged)</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select name="status" defaultValue={props.currentStatus ?? ""}>
              <option value="">(unchanged)</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" rows={2} />
          </label>
          <p className={styles.warn}>
            This sets manual_override_at so Stripe webhooks won&apos;t undo the change. Clear that
            timestamp from SQL to re-enable.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  tenantName,
  requireTypedName,
  onCancel,
  onSubmit,
  pending,
  error,
  children,
}: {
  title: string;
  confirmLabel: string;
  tenantName: string;
  requireTypedName?: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const canSubmit = !requireTypedName || typed === tenantName;

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
        >
          {children}
          {requireTypedName && (
            <label className={styles.field}>
              <span>
                Type the tenant name (<code>{tenantName}</code>) to confirm
              </span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel} disabled={pending}>
              Cancel
            </button>
            <button type="submit" disabled={pending || !canSubmit}>
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
