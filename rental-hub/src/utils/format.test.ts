/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { roundMoney } from './format.ts';

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
