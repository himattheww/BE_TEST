import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertLineItemsWithAudit } from '../src/repositories/line-items';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../src/db/supabase', () => ({ supabase: { rpc } }));

const params = {
  projectId: '0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10',
  items: [
    {
      item_code: 'A-001',
      description: 'Excavation',
      volume: '0.1',
      unit: null,
      unit_price: '0.2',
      total_price: '0.02',
    },
  ],
  action: 'items.process',
  endpoint: '/api/v1/items/process',
  summary: { item_count: 1 },
};

beforeEach(() => {
  rpc.mockReset();
});

describe('insertLineItemsWithAudit', () => {
  it('calls the atomic insert function with the expected arguments', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'row-1' }], error: null });

    const rows = await insertLineItemsWithAudit(params);

    expect(rpc).toHaveBeenCalledWith('insert_line_items_with_audit', {
      p_project_id: params.projectId,
      p_items: params.items,
      p_action: params.action,
      p_endpoint: params.endpoint,
      p_summary: params.summary,
    });
    expect(rows).toEqual([{ id: 'row-1' }]);
  });

  it('maps a foreign key violation to a 404', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23503', message: 'foreign key violation' } });

    await expect(insertLineItemsWithAudit(params)).rejects.toMatchObject({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('rethrows any other database error', async () => {
    const error = { code: '57014', message: 'statement timeout' };
    rpc.mockResolvedValue({ data: null, error });

    await expect(insertLineItemsWithAudit(params)).rejects.toBe(error);
  });
});
