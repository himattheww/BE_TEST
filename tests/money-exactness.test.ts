import { describe, expect, it } from 'vitest';
import { calculateTotal } from '../src/lib/money';

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const scaled = (units: bigint, scale: number) => {
  const digits = units.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
};

const referenceTotal = (volumeUnits: bigint, priceUnits: bigint) => {
  const product = volumeUnits * priceUnits;
  const cents = product / 10_000n + (product % 10_000n >= 5_000n ? 1n : 0n);
  return scaled(cents, 2);
};

describe('calculateTotal exactness', () => {
  it('matches exact integer arithmetic for 20,000 random inputs', () => {
    const random = mulberry32(20261009);
    const mismatches: string[] = [];

    for (let i = 0; i < 20_000; i += 1) {
      const volumeUnits = BigInt(1 + Math.floor(random() * 1e13));
      const priceUnits = BigInt(Math.floor(random() * 1e11));
      const volume = scaled(volumeUnits, 4);
      const unitPrice = scaled(priceUnits, 2);

      const expected = referenceTotal(volumeUnits, priceUnits);
      const fromNumbers = calculateTotal(Number(volume), Number(unitPrice));
      const fromStrings = calculateTotal(volume, unitPrice);

      if (fromNumbers !== expected || fromStrings !== expected) {
        mismatches.push(`${volume} x ${unitPrice}: expected ${expected}, got ${fromNumbers} / ${fromStrings}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
