import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { app } from '../src/app';
import { success } from '../src/lib/response';
import { errorHandler, notFound } from '../src/middleware/error-handler';
import { validateBody } from '../src/middleware/validate';

const testApp = express();
testApp.use(express.json());
testApp.post('/validated', validateBody(z.object({ count: z.number() })), (req, res) => {
  res.json(success(req.body));
});
testApp.get('/boom', () => {
  throw new Error('connection failed: postgres://user:secret@host/db');
});
testApp.use(notFound);
testApp.use(errorHandler);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error handling', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app).post('/health').set('Content-Type', 'application/json').send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INVALID_REQUEST_BODY', message: 'Request body is not valid JSON' },
    });
  });

  it('returns 400 with field details when validation fails', async () => {
    const res = await request(testApp).post('/validated').send({ count: 'one' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ path: 'count', message: expect.any(String) }]);
  });

  it('passes valid bodies through the validator', async () => {
    const res = await request(testApp).post('/validated').send({ count: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { count: 3 } });
  });

  it('returns a generic 500 without leaking the internal error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(testApp).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
