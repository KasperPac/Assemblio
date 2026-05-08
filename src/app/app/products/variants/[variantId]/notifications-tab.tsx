"use client";

import styles from "../../variant-detail.module.css";

type LaborStep = {
  id: string;
  sequence: number;
  operationName: string;
  departmentName: string;
};

type ExistingTrigger = {
  routingSequence: number;
  messageTemplate: string;
};

type Props = {
  activeBomId: string | null;
  laborLines: LaborStep[];
  existingTriggers: ExistingTrigger[];
  variantId: string;
  canManage: boolean;
  upsertAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  successMessage?: string;
  errorMessage?: string;
};

export default function NotificationsTab({
  activeBomId,
  laborLines,
  existingTriggers,
  variantId,
  canManage,
  upsertAction,
  removeAction,
  successMessage,
  errorMessage,
}: Props) {
  if (!activeBomId) {
    return (
      <p className={styles.notice} style={{ fontStyle: "italic" }}>
        No active BOM. Activate a BOM version first to configure notifications.
      </p>
    );
  }

  if (laborLines.length === 0) {
    return (
      <p className={styles.notice} style={{ fontStyle: "italic" }}>
        No routing steps in the active BOM. Add labour operations first.
      </p>
    );
  }

  const triggerMap = new Map(existingTriggers.map((t) => [t.routingSequence, t]));

  return (
    <div className={styles.bomList}>
      {successMessage ? <p className={styles.success}>{successMessage}</p> : null}
      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

      <p className={styles.meta} style={{ marginBottom: "16px" }}>
        Configure which production steps send an email to the customer when completed.
        Available variables: <code>{"{{product_name}}"}</code>, <code>{"{{order_number}}"}</code>,{" "}
        <code>{"{{department_name}}"}</code>.
      </p>

      {laborLines.map((step) => {
        const existing = triggerMap.get(step.sequence);
        const isEnabled = !!existing;

        return (
          <div key={step.id} className={styles.lineTable}>
            <div className={styles.bomHeader}>
              <div className={styles.lineRow}>
                <strong>
                  Step {step.sequence}: {step.operationName}
                </strong>
                <span className={styles.meta}>{step.departmentName}</span>
              </div>
            </div>

            {canManage ? (
              isEnabled ? (
                <form action={upsertAction} className={styles.routingCreateForm}>
                  <input type="hidden" name="product_bom_id" value={activeBomId} />
                  <input type="hidden" name="routing_sequence" value={step.sequence} />
                  <input type="hidden" name="variant_id" value={variantId} />
                  <div className={styles.routingFormGrid}>
                    <div className={`${styles.routingField} ${styles.routingSpanTwo}`}>
                      <label>Message template</label>
                      <textarea
                        name="message_template"
                        rows={3}
                        defaultValue={existing.messageTemplate}
                        placeholder="Hi {{customer_first_name}}, your {{product_name}} is now in our {{department_name}} department."
                        required
                        style={{ resize: "vertical", width: "100%" }}
                      />
                    </div>
                    <div className={`${styles.routingActions} ${styles.routingSpanTwo}`}>
                      <button className={styles.secondaryButton} type="submit">
                        Save
                      </button>
                      <button
                        className={styles.secondaryButton}
                        type="submit"
                        formAction={removeAction}
                      >
                        Disable notification
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form action={upsertAction} className={styles.routingCreateForm}>
                  <input type="hidden" name="product_bom_id" value={activeBomId} />
                  <input type="hidden" name="routing_sequence" value={step.sequence} />
                  <input type="hidden" name="variant_id" value={variantId} />
                  <input
                    type="hidden"
                    name="message_template"
                    value={`Your {{product_name}} has completed the ${step.operationName} step.`}
                  />
                  <div className={styles.routingActions}>
                    <button className={styles.secondaryButton} type="submit">
                      Enable notification for this step
                    </button>
                  </div>
                </form>
              )
            ) : (
              <p className={styles.meta} style={{ padding: "8px 0" }}>
                {isEnabled
                  ? `Notification enabled: "${existing.messageTemplate}"`
                  : "No notification configured."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
