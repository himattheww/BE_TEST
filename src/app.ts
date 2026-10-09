import express from 'express';
import { success } from './lib/response';
import { requireApiKey } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error-handler';
import { itemsRouter } from './routes/items';
import { webhookRouter } from './routes/webhook';

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json(success({ status: 'ok' }));
});

app.use('/api/v1/items', requireApiKey, itemsRouter);
app.use('/api/v1/webhook', requireApiKey, webhookRouter);

app.use(notFound);
app.use(errorHandler);
