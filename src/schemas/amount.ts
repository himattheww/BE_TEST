import { z } from 'zod';
import { compareAmounts, countDecimals, toPlainString } from '../lib/money';

const MAX_AMOUNT = '1000000000';
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

type AmountRule = {
  field: string;
  maxDecimals: number;
  allowZero: boolean;
  allowStrings: boolean;
};

const readNumber = (value: unknown, allowStrings: boolean): string | null => {
  let text: string | null = null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    text = toPlainString(value);
  } else if (allowStrings && typeof value === 'string') {
    text = value.trim();
  }

  return text !== null && PLAIN_NUMBER.test(text) ? text : null;
};

export const amount = ({ field, maxDecimals, allowZero, allowStrings }: AmountRule) =>
  z.unknown().transform((value, ctx) => {
    const reject = (message: string) => {
      ctx.addIssue({ code: 'custom', message: `${field} ${message}` });
      return z.NEVER;
    };

    const text = readNumber(value, allowStrings);
    if (text === null) return reject('must be a number');

    const sign = compareAmounts(text, 0);
    if (sign < 0) return reject('must not be negative');
    if (sign === 0 && !allowZero) return reject('must be greater than 0');
    if (compareAmounts(text, MAX_AMOUNT) > 0) return reject(`must not exceed ${MAX_AMOUNT}`);
    if (countDecimals(text) > maxDecimals) return reject(`must have at most ${maxDecimals} decimal places`);

    return toPlainString(text);
  });
