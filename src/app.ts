import express from 'express';
import { success } from './lib/response';
import { errorHandler, notFound } from './middleware/error-handler';

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json(success({ status: 'ok' }));
});

app.use(notFound);
app.use(errorHandler);
