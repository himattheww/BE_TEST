import { z } from 'zod';
import { amount } from './amount';

export const itemInputSchema = z.object({
  item_code: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(500),
  volume: amount({ field: 'volume', maxDecimals: 4, allowZero: false, allowStrings: false }),
  unit: z.string().trim().min(1).max(20).optional(),
  unit_price: amount({ field: 'unit_price', maxDecimals: 2, allowZero: true, allowStrings: false }),
});

export const processItemsSchema = z.object({
  project_id: z.uuid(),
  items: z.array(itemInputSchema).min(1).max(500),
});

export type ProcessItemsInput = z.infer<typeof processItemsSchema>;
