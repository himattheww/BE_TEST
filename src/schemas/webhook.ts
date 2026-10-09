import { z } from 'zod';
import { amount } from './amount';

const webhookItemSchema = z.object({
  itemCode: z.string().trim().min(1).max(50),
  itemDescription: z.string().trim().min(1).max(500),
  qty: amount({ field: 'qty', maxDecimals: 4, allowZero: false, allowStrings: true }),
  uom: z.string().trim().min(1).max(20).optional(),
  price: amount({ field: 'price', maxDecimals: 2, allowZero: true, allowStrings: true }),
});

export const webhookPayloadSchema = z.object({
  event: z.literal('line_items.created'),
  eventId: z.string().trim().min(1).max(100),
  data: z.object({
    projectId: z.uuid(),
    lineItems: z.array(webhookItemSchema).min(1).max(500),
  }),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
