"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import StatusBadge from "../_ui/status-badge";
import { parseQtyInput } from "@/lib/bom/qty-input";
import { setTemplateLines } from "./actions";
import type { AffectedBom } from "./affected";
import { LinkControls } from "./link-controls";
import {
  TemplatePickerLightbox,
  RemoveLineButton,
  DeleteTemplateButton,
} from "./template-forms";
import type { ComponentOption } from "@/app/app/products/_components/component-picker";
import styles from "./templates.module.css";

export type ComponentTemplateRowData = {
  id: string;
  name: string;
  description: string | null;
  isLinked: boolean;
  hasUnpublished: boolean;
  lines: {
    id: string;
    componentId: string;
    componentName: string;
    sku: string | null;
    unit: string | null;
    quantity: number;
  }[];
  affected: AffectedBom[];
};

function usedByLabel(affected: AffectedBom[]): string {
  if (affected.length === 0) return "—";
  return `${affected.length} BOM${affected.length === 1 ? "" : "s"}`;
}

function usedByFooter(affected: AffectedBom[]): string {
  if (affected.length === 0) return "Not used yet";
  return `Used by ${affected.length} BOM${affected.length === 1 ? "" : "s"}`;
}

export function ComponentTemplateTable({
  templates,
  components,
}: {
  templates: ComponentTemplateRowData[];
  components: ComponentOption[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Template</th>
            <th>Items</th>
            <th>Used by</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <Fragment key={t.id}>
                <tr
                  className={styles.rowClickable}
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                  tabIndex={0}
                  aria-expanded={expanded}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : t.id);
                    }
                  }}
                >
                  <td>
                    <span className={styles.chevron} aria-hidden="true">
                      {expanded ? "▾" : "▸"}
                    </span>
                    <span className={styles.rowName}>{t.name}</span>
                  </td>
                  <td>{t.lines.length}</td>
                  <td>{usedByLabel(t.affected)}</td>
                  <td>
                    <span className={styles.badgeGroup}>
                      {t.isLinked ? (
                        <StatusBadge variant="success">Linked</StatusBadge>
                      ) : (
                        <StatusBadge>Not linked</StatusBadge>
                      )}
                      {t.hasUnpublished ? (
                        <StatusBadge variant="warning">Unpublished changes</StatusBadge>
                      ) : null}
                    </span>
                  </td>
                </tr>
                {expanded ? (
                  <tr className={styles.expRow}>
                    <td colSpan={4} className={styles.expCell}>
                      <ComponentExpansion template={t} components={components} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComponentExpansion({
  template,
  components,
}: {
  template: ComponentTemplateRowData;
  components: ComponentOption[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function commitQty(lineId: string) {
    const raw = drafts[lineId];
    if (raw === undefined) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    const parsed = parseQtyInput(raw);
    const line = template.lines.find((l) => l.id === lineId);
    if (!line || parsed === null || parsed === line.quantity) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setTemplateLines(
        template.id,
        template.lines
          .filter((l) => l.componentId !== "")
          .map((l) => ({
            component_id: l.componentId,
            quantity: l.id === lineId ? parsed : l.quantity,
          }))
      );
      if (result.error) setError(result.error);
    } catch {
      setError("Something went wrong saving the quantity. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {template.description ? <p className={styles.expDesc}>{template.description}</p> : null}
      {template.lines.length > 0 ? (
        <div className={styles.expLineGrid}>
          <span className={styles.colHeader}>Component</span>
          <span className={styles.colHeader}>Qty</span>
          <span className={styles.colHeader}>Unit</span>
          <span />
          {template.lines.map((line) => (
            <Fragment key={line.id}>
              <span className={styles.expComponent}>
                {line.componentId !== "" ? (
                  <Link
                    href={`/app/components/${line.componentId}`}
                    className={styles.componentLink}
                  >
                    {line.componentName}
                  </Link>
                ) : (
                  <span>{line.componentName}</span>
                )}
                {line.sku ? <span className={styles.expSku}>{line.sku}</span> : null}
              </span>
              <input
                className={styles.qtyInput}
                value={drafts[line.id] ?? String(line.quantity)}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))
                }
                onBlur={() => commitQty(line.id)}
                disabled={busy}
                inputMode="decimal"
                aria-label={`Quantity for ${line.componentName}`}
              />
              <span className={styles.expUnit}>{line.unit ?? "ea"}</span>
              <RemoveLineButton lineId={line.id} templateId={template.id} disabled={busy} />
            </Fragment>
          ))}
        </div>
      ) : (
        <p className={styles.expEmpty}>No template lines yet.</p>
      )}
      <div className={styles.expAddRow}>
        <TemplatePickerLightbox
          templateId={template.id}
          templateName={template.name}
          existingLines={template.lines.map((l) => ({
            component_id: l.componentId,
            quantity: l.quantity,
          }))}
          components={components}
        />
      </div>
      {error ? <p className={styles.expError}>{error}</p> : null}
      <div className={styles.expFooter}>
        <LinkControls
          templateType="component"
          templateId={template.id}
          isLinked={template.isLinked}
          hasUnpublished={template.hasUnpublished}
          affectedBoms={template.affected}
        />
        <span className={styles.usedBy}>{usedByFooter(template.affected)}</span>
        <DeleteTemplateButton templateId={template.id} usedByCount={template.affected.length} />
      </div>
    </div>
  );
}
