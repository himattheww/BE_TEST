import type { WebhookPayload } from '../schemas/webhook';
import type { LineItemDraft } from './line-items';

export const toLineItemDrafts = ({ data }: WebhookPayload): LineItemDraft[] =>
  data.lineItems.map((item) => ({
    item_code: item.itemCode.toUpperCase(),
    description: item.itemDescription,
    volume: item.qty,
    unit: item.uom,
    unit_price: item.price,
  }));
