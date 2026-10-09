import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { insertLineItemsWithAudit } from '../src/repositories/line-items';

vi.mock('../src/repositories/line-items', () => ({ insertLineItemsWithAudit: vi.fn() }));

const endpoint = '/api/v1/webhook/ingest';
const authorization = 'Bearer test-api-secret-0123456789';
const projectId = '0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10';
const insert = vi.mocked(insertLineItemsWithAudit);

const payload = {
  event: 'line_items.created',
  eventId: 'evt_20261009_001',
  data: {
    projectId,
    lineItems: [
      { itemCode: ' a-001 ', itemDescription: '  Excavation  ', qty: '12.50', uom: 'm3', price: '150000.00' },
      { itemCode: 'B-002', itemDescription: 'Formwork', qty: 0.1, price: '0.20' },
    ],
  },
};

const withItem = (override: object) => ({
  ...payload,
  data: { ...payload.data, lineItems: [{ ...payload.data.lineItems[0], ...override }] },
});

beforeEach(() => {
  insert.mockReset();
  insert.mockImplementation(async (args) =>
    args.items.map((item, index) => ({
      id: `row-${index + 1}`,
      project_id: args.projectId,
      ...item,
      created_at: '2026-10-09T00:00:00+00:00',
    })),
  );
});

describe('authentication', () => {
  it('returns 401 without credentials', async () => {
    const res = await request(app).post(endpoint).send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong bearer token', async () => {
    const res = await request(app).post(endpoint).set('Authorization', 'Bearer wrong').send(payload);

    expect(res.status).toBe(401);
  });

  it('accepts the API key in the X-API-Key header', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('X-API-Key', 'test-api-secret-0123456789')
      .send(payload);

    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/webhook/ingest', () => {
  it('transforms the third-party payload into line items and stores them', async () => {
    const res = await request(app).post(endpoint).set('Authorization', authorization).send(payload);

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({
      projectId,
      items: [
        {
          item_code: 'A-001',
          description: 'Excavation',
          volume: '12.5',
          unit: 'm3',
          unit_price: '150000',
          total_price: '1875000.00',
        },
        {
          item_code: 'B-002',
          description: 'Formwork',
          volume: '0.1',
          unit: null,
          unit_price: '0.2',
          total_price: '0.02',
        },
      ],
      action: 'webhook.ingest',
      endpoint,
      summary: {
        event: 'line_items.created',
        event_id: 'evt_20261009_001',
        project_id: projectId,
        item_count: 2,
        grand_total: '1875000.02',
      },
    });
    expect(res.body.data).toMatchObject({
      event_id: 'evt_20261009_001',
      project_id: projectId,
      item_count: 2,
      grand_total: '1875000.02',
    });
  });

  it.each([
    ['a non-numeric qty', withItem({ qty: 'abc' }), 'data.lineItems.0.qty'],
    ['a negative qty', withItem({ qty: '-5' }), 'data.lineItems.0.qty'],
    ['a null qty', withItem({ qty: null }), 'data.lineItems.0.qty'],
    ['a zero qty', withItem({ qty: '0' }), 'data.lineItems.0.qty'],
    ['a qty in scientific notation', withItem({ qty: '1e3' }), 'data.lineItems.0.qty'],
    ['a qty with hidden extra precision', withItem({ qty: '12.50000000000000000001' }), 'data.lineItems.0.qty'],
    ['a negative price', withItem({ price: -1 }), 'data.lineItems.0.price'],
    ['a price with more than 2 decimals', withItem({ price: '33.335' }), 'data.lineItems.0.price'],
    ['an unsupported event', { ...payload, event: 'line_items.deleted' }, 'event'],
    ['a missing eventId', { ...payload, eventId: undefined }, 'eventId'],
    ['an invalid projectId', { ...payload, data: { ...payload.data, projectId: 'nope' } }, 'data.projectId'],
    ['an empty lineItems array', { ...payload, data: { ...payload.data, lineItems: [] } }, 'data.lineItems'],
  ])('returns 400 for %s', async (_label, body, path) => {
    const res = await request(app).post(endpoint).set('Authorization', authorization).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((detail: { path: string }) => detail.path)).toContain(path);
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when the database call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    insert.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).post(endpoint).set('Authorization', authorization).send(payload);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
