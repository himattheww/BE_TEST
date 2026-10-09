import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { failure } from '../lib/response';

type BodyParserError = { status: number; type: string };

const isBodyParserError = (err: unknown): err is BodyParserError =>
  typeof err === 'object' &&
  err !== null &&
  'type' in err &&
  typeof err.type === 'string' &&
  err.type.startsWith('entity.') &&
  'status' in err &&
  typeof err.status === 'number';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(failure(err.code, err.message, err.details));
    return;
  }

  if (isBodyParserError(err)) {
    const message =
      err.type === 'entity.parse.failed' ? 'Request body is not valid JSON' : 'Request body could not be processed';
    res.status(err.status).json(failure('INVALID_REQUEST_BODY', message));
    return;
  }

  console.error(err);
  res.status(500).json(failure('INTERNAL_ERROR', 'Internal server error'));
};
