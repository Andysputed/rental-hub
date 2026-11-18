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

export interface PaymentPreviewInput {
  amount: number;
  target?: ChargeLike;
  automatic: boolean;
  directedTotal?: number;
  outstandingTotal?: number;
  targetDirectedAmount?: number;
}

export interface PaymentPreview {
  appliedToTarget: number;
  remainingTargetBalance: number;
  advanceCredit: number;
}

/**
 * Mirrors backend allocation: automatic payments settle the oldest outstanding
 * balance (then later charges), manual payments only direct what was entered.
 * Never reports more applied than the target balance or more credit than the
 * receipt amount.
 */
export function buildPaymentPreview({
  amount,
  target,
  automatic,
  directedTotal = 0,
  outstandingTotal = 0,
  targetDirectedAmount,
}: PaymentPreviewInput): PaymentPreview {
  const paid = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100);
  const balance = target ? Math.max(0, chargeBalance(target)) : 0;
  const plannedForTarget = target
    ? automatic
      ? paid
      : Math.min(paid, Math.max(0, Number(targetDirectedAmount) || 0))
    : 0;
  const appliedToTarget = Math.min(balance, plannedForTarget);
  const remainingTargetBalance = Math.round((balance - appliedToTarget) * 100) / 100;
  const allocated = automatic
    ? Math.min(paid, Math.max(0, outstandingTotal))
    : Math.min(paid, Math.max(0, directedTotal));
  const advanceCredit = Math.round((paid - allocated) * 100) / 100;
  return { appliedToTarget, remainingTargetBalance, advanceCredit };
}
