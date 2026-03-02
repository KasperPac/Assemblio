type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: { message?: string } | null }>;
};

type ApplyInventoryMovementInput = {
  componentId: string;
  locationId: string;
  deltaOnHand: number;
  deltaInProd: number;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
};

export async function applyInventoryMovement(
  client: RpcClient,
  input: ApplyInventoryMovementInput
) {
  const { error } = await client.rpc("apply_inventory_movement", {
    p_component_id: input.componentId,
    p_location_id: input.locationId,
    p_delta_on_hand: input.deltaOnHand,
    p_delta_in_prod: input.deltaInProd,
    p_reason: input.reason,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to apply inventory movement.");
  }
}
