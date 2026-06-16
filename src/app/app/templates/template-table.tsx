"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import StatusBadge from "../_ui/status-badge";
import { parseQtyInput } from "@/lib/bom/qty-input";
import { setTemplateLines, reorderTemplateLines } from "./actions";
import type { LaborTemplateLineInput } from "./actions";
import type { AffectedBom } from "./affected";
import { LinkControls } from "./link-controls";
import {
  TemplatePickerLightbox,
  RemoveLineButton,
  DeleteTemplateButton,
} from "./template-forms";
import {
  LaborLinesEditor,
  ModeSwitch,
  DeleteLaborTemplateButton,
  type DepartmentOption,
} from "./labor-template-forms";
import type { ComponentOption } from "@/app/app/products/_components/component-picker";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
    costPerUnit: number | null;
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

function SortableLineRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td className={styles.expDragHandle} {...listeners}>
        <span className={styles.expGripIcon}>⠿</span>
      </td>
      {children}
    </tr>
  );
}

function fmt(cost: number | null): string {
  return cost !== null ? `$${cost.toFixed(2)}` : "—";
}

function ComponentExpansion({
  template,
  components,
}: {
  template: ComponentTemplateRowData;
  components: ComponentOption[];
}) {
  const [lines, setLines] = useState(template.lines);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLines(template.lines);
  }, [template.lines]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = lines.findIndex((l) => l.id === active.id);
      const newIndex = lines.findIndex((l) => l.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = [...lines];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setLines(reordered);
      startTransition(async () => {
        const result = await reorderTemplateLines(
          template.id,
          reordered.map((l) => l.id)
        );
        if (result.error) setError(result.error);
      });
    },
    [lines, template.id, startTransition]
  );

  async function commitQty(lineId: string) {
    const raw = drafts[lineId];
    if (raw === undefined) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    const parsed = parseQtyInput(raw);
    const line = lines.find((l) => l.id === lineId);
    if (!line || parsed === null || parsed === line.quantity) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setTemplateLines(
        template.id,
        lines
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

  function handleStepperClick(lineId: string, delta: number) {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const current = drafts[lineId] !== undefined ? (parseQtyInput(drafts[lineId]) ?? line.quantity) : line.quantity;
    const next = Math.max(0.001, current + delta);
    // Optimistic update
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, quantity: next } : l)));
    setBusy(true);
    setError(null);
    setTemplateLines(
      template.id,
      lines
        .filter((l) => l.componentId !== "")
        .map((l) => ({
          component_id: l.componentId,
          quantity: l.id === lineId ? next : l.quantity,
        }))
    )
      .then((result) => {
        if (result.error) setError(result.error);
      })
      .catch(() => {
        setError("Something went wrong saving the quantity. Please try again.");
      })
      .finally(() => setBusy(false));
  }

  const materialCost = lines.every((l) => l.costPerUnit !== null)
    ? lines.reduce((sum, l) => sum + (l.costPerUnit ?? 0) * l.quantity, 0)
    : null;

  return (
    <div>
      {template.description ? <p className={styles.expDesc}>{template.description}</p> : null}

      {/* Toolbar */}
      <div className={styles.expToolbar}>
        <span className={styles.expToolbarCount}>
          {lines.length} component{lines.length !== 1 ? "s" : ""}
        </span>
        <TemplatePickerLightbox
          templateId={template.id}
          templateName={template.name}
          existingLines={lines.map((l) => ({
            component_id: l.componentId,
            quantity: l.quantity,
          }))}
          components={components}
        />
      </div>

      {/* Component table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <table className={styles.expTable}>
            <thead>
              <tr>
                <th className={styles.expDragHandleHeader} />
                <th>Component</th>
                <th>SKU</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Unit cost</th>
                <th>Line cost</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.expEmptyRow}>
                    No components yet — click + Add component above.
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <SortableLineRow key={line.id} id={line.id}>
                    <td>
                      <Link
                        href={`/app/components/${line.componentId}`}
                        className={styles.componentLink}
                      >
                        {line.componentName}
                      </Link>
                      {line.costPerUnit === null ? (
                        <span className={styles.expNoCostBadge}>no cost</span>
                      ) : null}
                    </td>
                    <td className={styles.expDimText}>{line.sku ?? "—"}</td>
                    <td className={styles.expDimText}>{line.unit ?? "ea"}</td>
                    <td>
                      <div className={styles.expStepper}>
                        <button
                          type="button"
                          onClick={() => handleStepperClick(line.id, -1)}
                          disabled={busy}
                          aria-label={`Decrease quantity for ${line.componentName}`}
                        >
                          −
                        </button>
                        <input
                          className={styles.expStepperInput}
                          value={drafts[line.id] ?? String(line.quantity)}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))
                          }
                          onBlur={() => commitQty(line.id)}
                          disabled={busy}
                          inputMode="decimal"
                          aria-label={`Quantity for ${line.componentName}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleStepperClick(line.id, 1)}
                          disabled={busy}
                          aria-label={`Increase quantity for ${line.componentName}`}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className={styles.expDimText}>{fmt(line.costPerUnit)}</td>
                    <td>{fmt(line.costPerUnit !== null ? line.costPerUnit * line.quantity : null)}</td>
                    <td>
                      <RemoveLineButton lineId={line.id} templateId={template.id} disabled={busy} />
                    </td>
                  </SortableLineRow>
                ))
              )}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>

      {/* Materials total */}
      {lines.length > 0 ? (
        <div className={styles.expMaterialsTotal}>
          <span className={styles.expTotalLabel}>Materials total</span>
          <span className={styles.expTotalValue}>{fmt(materialCost)}</span>
        </div>
      ) : null}

      {error ? <p className={styles.expError}>{error}</p> : null}

      {/* Footer */}
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

export type LaborTemplateRowData = {
  id: string;
  name: string;
  description: string | null;
  mode: "basic" | "advanced";
  isLinked: boolean;
  hasUnpublished: boolean;
  lines: LaborTemplateLineInput[];
  affected: AffectedBom[];
};

export function LaborTemplateTable({
  templates,
  departments,
}: {
  templates: LaborTemplateRowData[];
  departments: DepartmentOption[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Template</th>
            <th>Ops</th>
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
                    <span className={styles.rowName}>{t.name}</span>{" "}
                    {t.mode === "advanced" ? (
                      <StatusBadge variant="info">Advanced</StatusBadge>
                    ) : (
                      <StatusBadge>Basic</StatusBadge>
                    )}
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
                      {t.description ? (
                        <p className={styles.expDesc}>{t.description}</p>
                      ) : null}
                      <LaborLinesEditor
                        templateId={t.id}
                        mode={t.mode}
                        existingLines={t.lines}
                        departments={departments}
                      />
                      <div className={styles.expFooter}>
                        <LinkControls
                          templateType="labor"
                          templateId={t.id}
                          isLinked={t.isLinked}
                          hasUnpublished={t.hasUnpublished}
                          affectedBoms={t.affected}
                        />
                        <ModeSwitch templateId={t.id} mode={t.mode} />
                        <span className={styles.usedBy}>{usedByFooter(t.affected)}</span>
                        <DeleteLaborTemplateButton
                          templateId={t.id}
                          usedByCount={t.affected.length}
                        />
                      </div>
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
