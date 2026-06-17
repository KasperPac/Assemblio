export type ActivityActorType = "user" | "system" | "shopify" | "stripe";

type SummaryFn = (meta: Record<string, unknown>) => string;

export type ActivityEventDef = {
  entityType: string | null;
  summary: SummaryFn;
};

const s = (v: unknown, fallback = ""): string => {
  if (v === null || v === undefined) return fallback;
  return String(v);
};

export const ACTIVITY_EVENTS = {
  // --- Components ---
  "component.created": { entityType: "component", summary: (m) => `Created component ${s(m.name)}`.trim() },
  "component.updated": { entityType: "component", summary: (m) => `Updated component ${s(m.name)}`.trim() },
  "component.bin_location_updated": { entityType: "component", summary: (m) => `Updated bin location for ${s(m.name, "component")}` },
  "component.supplier_updated": { entityType: "component", summary: () => `Updated component supplier link` },
  "component.archived": { entityType: "component", summary: (m) => `Archived component ${s(m.name)}`.trim() },
  "component.image_updated": { entityType: "component", summary: (m) => `Updated image for ${s(m.name, "component")}` },
  "component.image_removed": { entityType: "component", summary: (m) => `Removed image for ${s(m.name, "component")}` },
  "component_group.created": { entityType: "component_group", summary: (m) => `Created group ${s(m.name)}`.trim() },

  // --- BOMs ---
  "bom.created": { entityType: "bom", summary: (m) => `Created BOM v${s(m.version, "1")}` },
  "bom.draft_created": { entityType: "bom", summary: () => `Created draft BOM` },
  "bom.created_from_template": { entityType: "bom", summary: (m) => `Created BOM from template ${s(m.templateName)}`.trim() },
  "bom.duplicated": { entityType: "bom", summary: () => `Duplicated BOM as draft` },
  "bom.status_changed": { entityType: "bom", summary: (m) => `Changed BOM status to ${s(m.status)}`.trim() },
  "bom.activated": { entityType: "bom", summary: () => `Set BOM active` },
  "bom.archived": { entityType: "bom", summary: () => `Archived BOM` },
  "bom.deleted": { entityType: "bom", summary: () => `Deleted draft BOM` },
  "bom.template_published": { entityType: "bom", summary: (m) => `Published template to BOM v${s(m.new_version)}` },
  "bom.line_added": { entityType: "bom", summary: () => `Added BOM component line` },
  "bom.line_updated": { entityType: "bom", summary: () => `Updated BOM component line` },
  "bom.line_removed": { entityType: "bom", summary: () => `Removed BOM component line` },
  "bom.lines_reordered": { entityType: "bom", summary: () => `Reordered BOM component lines` },
  "bom.labor_added": { entityType: "bom", summary: (m) => `Added labor step ${s(m.operationName)}`.trim() },
  "bom.labor_updated": { entityType: "bom", summary: (m) => `Updated labor step ${s(m.operationName)}`.trim() },
  "bom.labor_removed": { entityType: "bom", summary: () => `Removed labor step` },
  "bom.labor_template_applied": { entityType: "bom", summary: (m) => `Applied labor template ${s(m.templateName)}`.trim() },
  "product.notification_set": { entityType: "product", summary: () => `Set product notification trigger` },
  "product.notification_removed": { entityType: "product", summary: () => `Removed product notification trigger` },

  // --- Templates ---
  "template.created": { entityType: "bom_template", summary: (m) => `Created template ${s(m.name)}`.trim() },
  "template.updated": { entityType: "bom_template", summary: () => `Updated template lines` },
  "template.reordered": { entityType: "bom_template", summary: () => `Reordered template lines` },
  "template.deleted": { entityType: "bom_template", summary: () => `Deleted template` },
  "labor_template.created": { entityType: "labor_template", summary: (m) => `Created labor template ${s(m.name)}`.trim() },
  "labor_template.updated": { entityType: "labor_template", summary: () => `Updated labor template` },
  "labor_template.deleted": { entityType: "labor_template", summary: () => `Deleted labor template` },

  // --- Purchasing & inwards ---
  "purchase_order.created": { entityType: "purchase_order", summary: (m) => `Created ${s(m.poNumber, "purchase order")}` },
  "purchase_order.status_changed": { entityType: "purchase_order", summary: (m) => `Changed PO status to ${s(m.status)}`.trim() },
  "purchase_order.line_added": { entityType: "purchase_order", summary: () => `Added purchase order line` },
  "purchase_order.line_updated": { entityType: "purchase_order", summary: () => `Updated purchase order line quantity` },
  "goods_receipt.created": { entityType: "delivery_receipt", summary: (m) => `Created delivery receipt ${s(m.reference)}`.trim() },
  "goods_receipt.linked_to_po": { entityType: "delivery_receipt", summary: () => `Linked receipt to purchase order` },
  "goods_receipt.updated": { entityType: "delivery_receipt", summary: () => `Updated delivery receipt` },
  "supplier.created": { entityType: "supplier", summary: (m) => `Created supplier ${s(m.name)}`.trim() },
  "supplier.updated": { entityType: "supplier", summary: () => `Updated supplier` },
  "supplier.archived": { entityType: "supplier", summary: () => `Archived supplier` },
  "supplier.contact_added": { entityType: "supplier", summary: () => `Added supplier contact` },
  "supplier.contact_removed": { entityType: "supplier", summary: () => `Removed supplier contact` },
  "supplier.component_linked": { entityType: "supplier", summary: () => `Linked component to supplier` },
  "supplier.component_updated": { entityType: "supplier", summary: () => `Updated supplier component` },
  "supplier.component_unlinked": { entityType: "supplier", summary: () => `Unlinked component from supplier` },
  "supplier.preferred_changed": { entityType: "supplier", summary: () => `Changed preferred supplier` },
  "supplier.price_break_added": { entityType: "supplier", summary: () => `Added supplier price break` },
  "supplier.price_break_removed": { entityType: "supplier", summary: () => `Removed supplier price break` },

  // --- Inventory ---
  "inventory.movement_logged": { entityType: "component", summary: () => `Logged inventory movement` },
  "stocktake.opened": { entityType: "stocktake_session", summary: (m) => `Opened stocktake ${s(m.reference)}`.trim() },
  "stocktake.status_changed": { entityType: "stocktake_session", summary: (m) => `Changed stocktake status to ${s(m.status)}`.trim() },
  "stocktake.submitted": { entityType: "stocktake_session", summary: () => `Submitted stocktake for review` },
  "stocktake.applied": { entityType: "stocktake_session", summary: (m) => `Applied stocktake (${s(m.applied_lines, "0")} lines)` },
  "stocktake.sent_back": { entityType: "stocktake_session", summary: () => `Sent stocktake back for recount` },
  "stocktake.opening_stock_applied": { entityType: "stocktake_session", summary: () => `Applied opening stock` },
  "location.created": { entityType: "location", summary: (m) => `Created location ${s(m.name)}`.trim() },
  "location.updated": { entityType: "location", summary: (m) => `Updated location ${s(m.name)}`.trim() },
  "location.default_changed": { entityType: "location", summary: (m) => `Set default location to ${s(m.location_name)}`.trim() },
  "sub_location.created": { entityType: "bin_sub_location", summary: (m) => `Created sub-location ${s(m.name)}`.trim() },
  "sub_location.updated": { entityType: "bin_sub_location", summary: (m) => `Updated sub-location ${s(m.name)}`.trim() },
  "sub_location.deleted": { entityType: "bin_sub_location", summary: () => `Deleted sub-location` },
  "aisle.created": { entityType: "bin_aisle", summary: (m) => `Created aisle ${s(m.name)}`.trim() },
  "aisle.updated": { entityType: "bin_aisle", summary: (m) => `Updated aisle ${s(m.name)}`.trim() },
  "aisle.deleted": { entityType: "bin_aisle", summary: () => `Deleted aisle` },
  "bay.created": { entityType: "bin_bay", summary: (m) => `Created bay ${s(m.name)}`.trim() },
  "bay.updated": { entityType: "bin_bay", summary: (m) => `Updated bay ${s(m.name)}`.trim() },
  "bay.deleted": { entityType: "bin_bay", summary: () => `Deleted bay` },

  // --- Orders & production ---
  "order.allocation_run": { entityType: "order", summary: (m) => `Ran allocation (${s(m.changes_applied, "0")} changes)` },
  "order.labor_plan_updated": { entityType: "order", summary: () => `Updated job labor plan week` },
  "production.job_started": { entityType: "order_line", summary: () => `Started job` },
  "production.step_started": { entityType: "job_routing_step", summary: () => `Started routing step` },
  "production.step_completed": { entityType: "job_routing_step", summary: () => `Completed routing step` },
  "production.actual_time_logged": { entityType: "order_line", summary: () => `Logged actual time entry` },
  "capacity.week_refreshed": { entityType: null, summary: (m) => `Refreshed capacity for week ${s(m.week)}`.trim() },
  "staffing.week_prepared": { entityType: null, summary: (m) => `Prepared staffing for week ${s(m.weekStart)}`.trim() },
  "staff.created": { entityType: "staff_member", summary: (m) => `Added staff member ${s(m.name)}`.trim() },
  "staff.updated": { entityType: "staff_member", summary: () => `Updated staff member` },
  "department.created": { entityType: "department", summary: (m) => `Created department ${s(m.name)}`.trim() },
  "department.updated": { entityType: "department", summary: () => `Updated department` },
  "department.rate_changed": { entityType: "component", summary: () => `Updated department rate` },
  "department.rate_removed": { entityType: "component", summary: () => `Removed department` },
  "department.rate_added": { entityType: "component", summary: (m) => `Added department ${s(m.name)}`.trim() },
  "costing.financial_plans_generated": { entityType: null, summary: (m) => `Generated financial plans for week ${s(m.weekStart)}`.trim() },

  // --- Settings / admin ---
  "team.member_invited": { entityType: null, summary: (m) => `Invited ${s(m.email)}`.trim() },
  "team.invite_revoked": { entityType: null, summary: () => `Revoked invitation` },
  "team.invite_resent": { entityType: null, summary: (m) => `Resent invitation to ${s(m.email)}`.trim() },
  "team.role_changed": { entityType: null, summary: (m) => `Changed member role to ${s(m.role)}`.trim() },
  "team.member_deactivated": { entityType: null, summary: () => `Deactivated member` },
  "profile.updated": { entityType: null, summary: () => `Updated profile` },
  "profile.avatar_updated": { entityType: null, summary: () => `Updated avatar` },
  "company.updated": { entityType: null, summary: (m) => `Updated company ${s(m.name)}`.trim() },
  "company.logo_updated": { entityType: null, summary: () => `Updated company logo` },
  "settings.order_sla_updated": { entityType: null, summary: () => `Updated order SLA settings` },
  "integration.stats_only_set": { entityType: null, summary: () => `Updated Shopify import cutoff` },

  // --- Lifecycle / system ---
  "trash.emptied": { entityType: null, summary: () => `Emptied trash` },
  "trash.purchase_order_restored": { entityType: "purchase_order", summary: () => `Restored purchase order` },
  "trash.stocktake_restored": { entityType: "stocktake_session", summary: () => `Restored stocktake` },
  "trash.bom_restored": { entityType: "bom", summary: () => `Restored BOM` },
  "shopify.sync_completed": { entityType: null, summary: (m) => `Shopify sync completed (${s(m.products, "0")} products)` },
  "shopify.app_uninstalled": { entityType: null, summary: () => `Shopify app uninstalled` },
  "subscription.activated": { entityType: null, summary: (m) => `Subscription activated (${s(m.tier)} ${s(m.billing)})`.trim() },
} satisfies Record<string, ActivityEventDef>;

export type ActivityEvent = keyof typeof ACTIVITY_EVENTS;
