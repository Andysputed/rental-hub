export interface ChargeLike {
  id: string | number;
  tenancyId: string | number;
  month: string;
  amount: number;
  paidAmount: number;
}

export function chargeBalance(charge: ChargeLike): number {
  return Math.round((Number(charge.amount) - Number(charge.paidAmount)) * 100) / 100;
}

/**
 * Outstanding charges in the order the backend allocates automatic payments:
 * oldest billing month first, then due date/id order.
 */
export function outstandingChargesForTenancy<T extends ChargeLike>(
  charges: T[],
  tenancyId: string | number,
  startMonth?: string,
): T[] {
  const id = String(tenancyId);
  return charges
    .filter((charge) =>
      String(charge.tenancyId) === id &&
      (!startMonth || charge.month >= startMonth) &&
      chargeBalance(charge) > 0
    )
    .sort((a, b) => a.month.localeCompare(b.month) || Number(a.id) - Number(b.id));
}

export function resolveAllocationTarget<T extends ChargeLike>(
  charges: T[],
  tenancyId: string | number,
  startMonth?: string,
): T | undefined {
  return outstandingChargesForTenancy(charges, tenancyId, startMonth)[0];
}
