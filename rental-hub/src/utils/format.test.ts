/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatKSh, formatPaymentMethod, numberToWordsKSh, roundMoney } from './format.ts';

test('roundMoney keeps cents intact', () => {
  assert.equal(roundMoney(5866.67), 5866.67);
  assert.equal(roundMoney(4133.33), 4133.33);
});

test('roundMoney removes binary floating point noise', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(5866.665 + 0.005), 5866.67);
});

test('roundMoney leaves whole shillings unchanged', () => {
  assert.equal(roundMoney(10000), 10000);
  assert.equal(roundMoney(0), 0);
});

test('roundMoney normalises non-finite input to zero', () => {
  assert.equal(roundMoney(Number.NaN), 0);
  assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
});

test('formatKSh shows whole shillings without decimals', () => {
  assert.equal(formatKSh(10000), 'KSh 10,000');
  assert.equal(formatKSh(0), 'KSh 0');
});

test('formatKSh keeps meaningful fractional amounts visible', () => {
  assert.equal(formatKSh(5866.67), 'KSh 5,866.67');
  assert.equal(formatKSh(4133.33, false), '4,133.33');
  assert.equal(formatKSh(10000.5, false), '10,000.50');
  assert.equal(formatKSh(0.5, false), '0.50');
});

test('formatKSh removes floating point noise before displaying', () => {
  assert.equal(formatKSh(0.1 + 0.2, false), '0.30');
});

test('numberToWordsKSh spells whole shillings', () => {
  assert.equal(numberToWordsKSh(7500), 'Kenyan Shillings seven thousand five hundred');
  assert.equal(numberToWordsKSh(0), 'Kenyan Shillings zero');
});

test('numberToWordsKSh includes cents instead of silently rounding them away', () => {
  assert.equal(
    numberToWordsKSh(5866.67),
    'Kenyan Shillings five thousand eight hundred sixty six and 67/100',
  );
  assert.equal(numberToWordsKSh(0.5), 'Kenyan Shillings zero and 50/100');
});

test('formatPaymentMethod presents M-Pesa consistently', () => {
  assert.equal(formatPaymentMethod('mpesa'), 'M-Pesa');
  assert.equal(formatPaymentMethod('M-PESA'), 'M-Pesa');
  assert.equal(formatPaymentMethod('cash'), 'Cash');
  assert.equal(formatPaymentMethod('bank'), 'Bank transfer');
  assert.equal(formatPaymentMethod(''), '');
});
