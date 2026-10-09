import { calculateTotal, sumAmounts } from '../lib/money';
import { insertLineItemsWithAudit, type NewLineItem } from '../repositories/line-items';

export type LineItemDraft = {
  item_code: string;
  description: string;
  volume: string;
  unit?: string;
  unit_price: string;
};

type SaveParams = {
  projectId: string;
  drafts: LineItemDraft[];
  action: string;
  endpoint: string;
  meta?: Record<string, unknown>;
};

const toNewLineItem = (draft: LineItemDraft): NewLineItem => ({
  item_code: draft.item_code,
  description: draft.description,
  volume: draft.volume,
  unit: draft.unit ?? null,
  unit_price: draft.unit_price,
  total_price: calculateTotal(draft.volume, draft.unit_price),
});

export async function saveLineItems({ projectId, drafts, action, endpoint, meta }: SaveParams) {
  const items = drafts.map(toNewLineItem);
  const grandTotal = sumAmounts(items.map((item) => item.total_price));

  const rows = await insertLineItemsWithAudit({
    projectId,
    items,
    action,
    endpoint,
    summary: { ...meta, project_id: projectId, item_count: items.length, grand_total: grandTotal },
  });

  return { project_id: projectId, item_count: items.length, grand_total: grandTotal, items: rows };
}
