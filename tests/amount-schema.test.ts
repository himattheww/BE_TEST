import { describe, expect, it } from 'vitest';
import { amount } from '../src/schemas/amount';

const strict = amount({ field: 'volume', maxDecimals: 4, allowZero: false, allowStrings: false });
const lenient = amount({ field: 'price', maxDecimals: 2, allowZero: true, allowStrings: true });

describe('amount', () => {
  it('normalises numbers to plain decimal strings', () => {
    expect(strict.parse(12.5)).toBe('12.5');
    expect(strict.parse(0.0001)).toBe('0.0001');
  });

  it('accepts numeric strings only when strings are allowed', () => {
    expect(strict.safeParse('12.5').success).toBe(false);
    expect(lenient.parse(' 12.50 ')).toBe('12.5');
  });

  it.each([NaN, Infinity, null, undefined, true, {}, []])('rejects %s', (value) => {
    expect(lenient.safeParse(value).success).toBe(false);
  });

  it('rejects extra precision instead of rounding it away', () => {
    expect(lenient.safeParse('0.001').success).toBe(false);
    expect(lenient.safeParse('10.123456789').success).toBe(false);
  });

  it('allows zero only when configured', () => {
    expect(strict.safeParse(0).success).toBe(false);
    expect(lenient.parse(0)).toBe('0');
  });

  it('rejects values above the maximum', () => {
    expect(lenient.parse('1000000000')).toBe('1000000000');
    expect(lenient.safeParse('1000000000.01').success).toBe(false);
  });

  it('reports a readable message', () => {
    expect(strict.safeParse(-1).error?.issues[0]?.message).toBe('volume must not be negative');
    expect(strict.safeParse(0).error?.issues[0]?.message).toBe('volume must be greater than 0');
    expect(strict.safeParse('x').error?.issues[0]?.message).toBe('volume must be a number');
  });
});
