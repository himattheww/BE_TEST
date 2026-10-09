import { describe, expect, it } from 'vitest';
import { calculateTotal, countDecimals, sumAmounts, toPlainString } from '../src/lib/money';

describe('calculateTotal', () => {
  it.each([
    [0.1, 0.2, '0.02'],
    [3, 0.1, '0.30'],
    [1.1, 1.1, '1.21'],
    [4.35, 100, '435.00'],
    [1.005, 1, '1.01'],
    [2.675, 1, '2.68'],
    [0.5, 0.01, '0.01'],
    [1234.5678, 19.99, '24679.01'],
    [0.0001, 0.01, '0.00'],
    [10, 0, '0.00'],
    [1_000_000_000, 1_000_000_000, '1000000000000000000.00'],
  ])('%s x %s = %s', (volume, unitPrice, expected) => {
    expect(calculateTotal(volume, unitPrice)).toBe(expected);
  });
});

describe('countDecimals', () => {
  it.each([
    [100, 0],
    [0.1, 1],
    [1.005, 3],
    [0.0001, 4],
    [1e-7, 7],
  ])('%s has %s decimal places', (value, expected) => {
    expect(countDecimals(value)).toBe(expected);
  });
});

describe('sumAmounts', () => {
  it('adds amounts without floating point drift', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts(['1.10', '2.20', '3.30'])).toBe('6.60');
  });

  it('returns zero for an empty list', () => {
    expect(sumAmounts([])).toBe('0.00');
  });
});

describe('toPlainString', () => {
  it.each([
    [0.1, '0.1'],
    [1234.5678, '1234.5678'],
    [1e-7, '0.0000001'],
    [1_000_000_000, '1000000000'],
  ])('writes %s as %s without exponent notation', (value, expected) => {
    expect(toPlainString(value)).toBe(expected);
  });
});
