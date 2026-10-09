import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

const formatIssues = (error: z.ZodError) =>
  error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));

export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', formatIssues(result.error));
    }

    req.body = result.data;
    next();
  };
