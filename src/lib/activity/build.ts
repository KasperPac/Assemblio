import { ACTIVITY_EVENTS, type ActivityEvent, type ActivityActorType } from "./events";

export type BuildActivityRowParams = {
  event: ActivityEvent;
  tenantId: string;
  actorId: string | null;
  actorType: ActivityActorType;
  actorLabel: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export function buildActivityRow(params: BuildActivityRowParams) {
  const def = ACTIVITY_EVENTS[params.event];
  const metadata = params.metadata ?? {};
  return {
    tenant_id: params.tenantId,
    actor_id: params.actorId,
    actor_type: params.actorType,
    actor_label: params.actorLabel,
    event: params.event as string,
    entity_type: def.entityType,
    entity_id: params.entityId ?? null,
    summary: def.summary(metadata),
    metadata,
  };
}
