import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { AppError } from '../src/lib/errors';
import { insertLineItemsWithAudit } from '../src/repositories/line-items';

vi.mock('../src/repositories/line-items', () => ({ insertLineItemsWithAudit: vi.fn() }));

const endpoint = '/api/v1/items/process';
const authorization = 'Bearer test-api-secret-0123456789';
const projectId = '0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10';
const insert = vi.mocked(insertLineItemsWithAudit);

const payload = {
  project_id: projectId,
  items: [
    { item_code: 'A-001', description: 'Excavation', volume: 0.1, unit_price: 0.2 },
    { item_code: 'A-002', description: 'Concrete', volume: 1234.5678, unit: 'm3', unit_price: 19.99 },
  ],
};

const withItem = (override: object) => ({ ...payload, items: [{ ...payload.items[0], ...override }] });

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
  it.each([
    ['a missing header', undefined],
    ['the wrong scheme', 'Basic test-api-secret-0123456789'],
    ['a wrong token', 'Bearer wrong-token'],
    ['a token with extra characters', 'Bearer test-api-secret-0123456789x'],
  ])('returns 401 for %s', async (_label, header) => {
    const req = request(app).post(endpoint);
    if (header) req.set('Authorization', header);

    const res = await req.send(payload);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/items/process', () => {
  it('calculates totals with decimal precision and stores them with an audit summary', async () => {
    const res = await request(app).post(endpoint).set('Authorization', authorization).send(payload);

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({
      projectId,
      items: [
        {
          item_code: 'A-001',
          description: 'Excavation',
          volume: '0.1',
          unit: null,
          unit_price: '0.2',
          total_price: '0.02',
        },
        {
          item_code: 'A-002',
          description: 'Concrete',
          volume: '1234.5678',
          unit: 'm3',
          unit_price: '19.99',
          total_price: '24679.01',
        },
      ],
      action: 'items.process',
      endpoint,
      summary: { project_id: projectId, item_count: 2, grand_total: '24679.03' },
    });
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ project_id: projectId, item_count: 2, grand_total: '24679.03' });
    expect(res.body.data.items.map((item: { total_price: string }) => item.total_price)).toEqual(['0.02', '24679.01']);
  });

  it('accepts the API key in the X-API-Key header', async () => {
    const res = await request(app).post(endpoint).set('X-API-Key', 'test-api-secret-0123456789').send(payload);

    expect(res.status).toBe(201);
  });

  it('ignores a total_price sent by the client', async () => {
    const body = withItem({ total_price: 999 });

    const res = await request(app).post(endpoint).set('Authorization', authorization).send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].total_price).toBe('0.02');
  });

  it.each([
    ['a string volume', withItem({ volume: '10' }), 'items.0.volume'],
    ['a null volume', withItem({ volume: null }), 'items.0.volume'],
    ['a negative volume', withItem({ volume: -5 }), 'items.0.volume'],
    ['a string unit_price', withItem({ unit_price: '100' }), 'items.0.unit_price'],
    ['a null unit_price', withItem({ unit_price: null }), 'items.0.unit_price'],
    ['a negative unit_price', withItem({ unit_price: -1 }), 'items.0.unit_price'],
    ['a missing project_id', { items: payload.items }, 'project_id'],
    ['an empty items array', { ...payload, items: [] }, 'items'],
  ])('returns 400 for %s', async (_label, body, path) => {
    const res = await request(app).post(endpoint).set('Authorization', authorization).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((detail: { path: string }) => detail.path)).toContain(path);
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    insert.mockRejectedValueOnce(new AppError(404, 'PROJECT_NOT_FOUND', 'Project does not exist'));

    const res = await request(app).post(endpoint).set('Authorization', authorization).send(payload);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns a generic 500 when the database call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    insert.mockRejectedValueOnce(new Error('connection to db.example.supabase.co refused'));

    const res = await request(app).post(endpoint).set('Authorization', authorization).send(payload);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
