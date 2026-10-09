import { Router } from 'express';
import { success } from '../lib/response';
import { validateBody } from '../middleware/validate';
import { processItemsSchema, type ProcessItemsInput } from '../schemas/items';
import { saveLineItems } from '../services/line-items';

export const itemsRouter = Router();

itemsRouter.post('/process', validateBody(processItemsSchema), async (req, res) => {
  const { project_id, items }: ProcessItemsInput = req.body;

  const result = await saveLineItems({
    projectId: project_id,
    drafts: items,
    action: 'items.process',
    endpoint: `${req.baseUrl}${req.path}`,
  });

  res.status(201).json(success(result));
});
