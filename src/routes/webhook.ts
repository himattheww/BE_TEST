import { Router } from 'express';
import { success } from '../lib/response';
import { validateBody } from '../middleware/validate';
import { webhookPayloadSchema, type WebhookPayload } from '../schemas/webhook';
import { saveLineItems } from '../services/line-items';
import { toLineItemDrafts } from '../services/webhook';

export const webhookRouter = Router();

webhookRouter.post('/ingest', validateBody(webhookPayloadSchema), async (req, res) => {
  const payload: WebhookPayload = req.body;

  const result = await saveLineItems({
    projectId: payload.data.projectId,
    drafts: toLineItemDrafts(payload),
    action: 'webhook.ingest',
    endpoint: `${req.baseUrl}${req.path}`,
    meta: { event: payload.event, event_id: payload.eventId },
  });

  res.status(201).json(success({ event_id: payload.eventId, ...result }));
});
