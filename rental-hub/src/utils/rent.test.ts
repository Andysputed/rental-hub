/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFirstMonthRent, calculateRentForMonth } from './rent.ts';

test('first day of a month charges the full monthly rent', () => {
  const preview = calculateFirstMonthRent(10000, '2026-11-01');
  assert.ok(preview);
  assert.equal(preview.daysInMonth, 30);
  assert.equal(preview.chargeableDays, 30);
  assert.equal(preview.firstMonthRent, 10000);
  assert.equal(preview.isProrated, false);
});

test('mid-month move-in on a 30-day month is prorated', () => {
  const preview = calculateFirstMonthRent(10000, '2026-11-16');
  assert.ok(preview);
  assert.equal(preview.chargeableDays, 15);
  assert.equal(preview.daysInMonth, 30);
  assert.equal(preview.firstMonthRent, 5000);
  assert.equal(preview.isProrated, true);
});

test('mid-month move-in on a 31-day month is prorated', () => {
  const preview = calculateFirstMonthRent(10000, '2026-10-16');
  assert.ok(preview);
  assert.equal(preview.chargeableDays, 16);
  assert.equal(preview.daysInMonth, 31);
  assert.equal(preview.firstMonthRent, 5161.29);
});

test('February uses 28 days in a common year', () => {
  const preview = calculateFirstMonthRent(10000, '2026-02-15');
  assert.ok(preview);
  assert.equal(preview.daysInMonth, 28);
  assert.equal(preview.chargeableDays, 14);
  assert.equal(preview.firstMonthRent, 5000);
});

test('February uses 29 days in a leap year', () => {
  const preview = calculateFirstMonthRent(10000, '2028-02-15');
  assert.ok(preview);
  assert.equal(preview.daysInMonth, 29);
  assert.equal(preview.chargeableDays, 15);
  assert.equal(preview.firstMonthRent, 5172.41);
});

test('last day of a month charges one day', () => {
  const preview = calculateFirstMonthRent(10000, '2026-11-30');
  assert.ok(preview);
  assert.equal(preview.chargeableDays, 1);
  assert.equal(preview.firstMonthRent, 333.33);
  assert.equal(preview.isProrated, true);
});

test('rounds half-up to cents like the backend', () => {
  const preview = calculateFirstMonthRent(10000, '2026-11-17');
  assert.ok(preview);
  assert.equal(preview.chargeableDays, 14);
  assert.equal(preview.firstMonthRent, 4666.67);
});

test('following month always carries the full rent', () => {
  const preview = calculateFirstMonthRent(8500, '2026-11-16');
  assert.ok(preview);
  assert.equal(preview.followingMonthRent, 8500);
  assert.equal(preview.followingMonthLabel, 'December 2026');
});

test('December move-in rolls the following month into the next year', () => {
  const preview = calculateFirstMonthRent(8500, '2026-12-15');
  assert.ok(preview);
  assert.equal(preview.chargeableDays, 17);
  assert.equal(preview.followingMonthLabel, 'January 2027');
});

test('preview recalculates when the move-in date or rent changes', () => {
  const early = calculateFirstMonthRent(10000, '2026-11-05');
  const late = calculateFirstMonthRent(10000, '2026-11-25');
  const higherRent = calculateFirstMonthRent(12000, '2026-11-05');
  assert.ok(early && late && higherRent);
  assert.equal(early.firstMonthRent, 8666.67);
  assert.equal(late.firstMonthRent, 2000);
  assert.equal(higherRent.firstMonthRent, 10400);
  assert.notEqual(early.firstMonthRent, late.firstMonthRent);
  assert.notEqual(early.firstMonthRent, higherRent.firstMonthRent);
});

test('invalid input yields no preview', () => {
  assert.equal(calculateFirstMonthRent(10000, ''), null);
  assert.equal(calculateFirstMonthRent(10000, '2026-02-30'), null);
  assert.equal(calculateFirstMonthRent(10000, '15/11/2026'), null);
  assert.equal(calculateFirstMonthRent(0, '2026-11-16'), null);
  assert.equal(calculateFirstMonthRent(-500, '2026-11-16'), null);
  assert.equal(calculateFirstMonthRent(Number.NaN, '2026-11-16'), null);
});

test('rent for the move-in month is the prorated first-month amount', () => {
  assert.equal(calculateRentForMonth(8500, '2026-11-13', '2026-11'), 5100);
});

test('rent for a later month is the full monthly rent', () => {
  assert.equal(calculateRentForMonth(8500, '2026-11-13', '2026-12'), 8500);
  assert.equal(calculateRentForMonth(8500, '2026-11-13', '2027-01'), 8500);
});

test('a first-day move-in pays full rent in the move-in month', () => {
  assert.equal(calculateRentForMonth(8500, '2026-11-01', '2026-11'), 8500);
});

test('a month before the tenancy starts has no expected rent', () => {
  assert.equal(calculateRentForMonth(8500, '2026-11-13', '2026-10'), null);
});

test('an invalid month returns null', () => {
  assert.equal(calculateRentForMonth(8500, '2026-11-13', '2026-13'), null);
  assert.equal(calculateRentForMonth(8500, '2026-11-13', ''), null);
});
