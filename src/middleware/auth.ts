import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const digest = (value: string) => createHash('sha256').update(value).digest();

const expected = digest(env.API_SECRET);

const readToken = (req: Request): string | undefined => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme.toLowerCase() === 'bearer' && token) return token;

  const apiKey = req.headers['x-api-key'];
  return typeof apiKey === 'string' ? apiKey : undefined;
};

export const requireApiKey: RequestHandler = (req, _res, next) => {
  const token = readToken(req);

  if (!token || !timingSafeEqual(digest(token), expected)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid API key');
  }

  next();
};
