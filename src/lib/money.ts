import { Decimal as BaseDecimal } from 'decimal.js';

const Decimal = BaseDecimal.clone({ precision: 50, rounding: BaseDecimal.ROUND_HALF_UP });

export type Numeric = number | string;

export const TOTAL_SCALE = 2;

export function calculateTotal(volume: Numeric, unitPrice: Numeric): string {
  return new Decimal(volume)
    .times(unitPrice)
    .toDecimalPlaces(TOTAL_SCALE, BaseDecimal.ROUND_HALF_UP)
    .toFixed(TOTAL_SCALE);
}

export function toPlainString(value: Numeric): string {
  return new Decimal(value).toFixed();
}

export function countDecimals(value: Numeric): number {
  return new Decimal(value).decimalPlaces();
}

export function compareAmounts(a: Numeric, b: Numeric): number {
  return new Decimal(a).comparedTo(b);
}

export function sumAmounts(amounts: string[]): string {
  return amounts.reduce((sum, amount) => sum.plus(amount), new Decimal(0)).toFixed(TOTAL_SCALE);
}
