/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentPreview,
  chargeBalance,
  outstandingChargesForTenancy,
  resolveAllocationTarget,
  type ChargeLike,
} from './payment.ts';

const charges: ChargeLike[] = [
  { id: 3, tenancyId: 1, month: '2026-11', amount: 12000, paidAmount: 11000 },
  { id: 1, tenancyId: 1, month: '2026-09', amount: 12000, paidAmount: 0 },
  { id: 2, tenancyId: 1, month: '2026-10', amount: 12000, paidAmount: 12000 },
  { id: 4, tenancyId: 2, month: '2026-08', amount: 13500, paidAmount: 13500 },
];

test('charge balance uses integer cents', () => {
  assert.equal(chargeBalance({ id: 1, tenancyId: 1, month: '2026-09', amount: 5866.67, paidAmount: 5810.67 }), 56);
  assert.equal(chargeBalance({ id: 2, tenancyId: 1, month: '2026-10', amount: 12000, paidAmount: 0 }), 12000);
});

test('outstanding charges are oldest first and scoped to the tenancy', () => {
  const result = outstandingChargesForTenancy(charges, '1');
  assert.deepEqual(result.map((c) => c.id), [1, 3]);
});

test('outstanding charges ignore months before the tenancy start', () => {
  const result = outstandingChargesForTenancy(charges, 1, '2026-10');
  assert.deepEqual(result.map((c) => c.id), [3]);
});

test('allocation target is the oldest outstanding charge regardless of the selected month', () => {
  const target = resolveAllocationTarget(charges, 1);
  assert.equal(target?.id, 1);
  assert.equal(target?.month, '2026-09');
});

test('allocation target is undefined when nothing is outstanding', () => {
  assert.equal(resolveAllocationTarget(charges, 2), undefined);
  assert.equal(resolveAllocationTarget(charges, 99), undefined);
});

test('automatic preview applies at most the target balance and holds the rest as credit', () => {
  const target = charges[0];
  const preview = buildPaymentPreview({
    amount: 25000,
    target,
    automatic: true,
    outstandingTotal: 1000,
  });
  assert.equal(preview.appliedToTarget, 1000);
  assert.equal(preview.remainingTargetBalance, 0);
  assert.equal(preview.advanceCredit, 24000);
});

test('automatic preview never applies more than the outstanding balance', () => {
  const preview = buildPaymentPreview({
    amount: 500,
    target: charges[0],
    automatic: true,
    outstandingTotal: 1000,
  });
  assert.equal(preview.appliedToTarget, 500);
  assert.equal(preview.remainingTargetBalance, 500);
  assert.equal(preview.advanceCredit, 0);
});

test('manual preview only credits what was actually directed', () => {
  const preview = buildPaymentPreview({
    amount: 5000,
    target: charges[0],
    automatic: false,
    directedTotal: 4000,
    targetDirectedAmount: 1000,
  });
  assert.equal(preview.appliedToTarget, 1000);
  assert.equal(preview.remainingTargetBalance, 0);
  assert.equal(preview.advanceCredit, 1000);
});

test('manual preview caps the target allocation at its balance', () => {
  const preview = buildPaymentPreview({
    amount: 5000,
    target: charges[0],
    automatic: false,
    directedTotal: 5000,
    targetDirectedAmount: 5000,
  });
  assert.equal(preview.appliedToTarget, 1000);
  assert.equal(preview.advanceCredit, 0);
});
