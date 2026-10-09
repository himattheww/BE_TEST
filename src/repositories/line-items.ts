import { supabase } from '../db/supabase';
import { AppError } from '../lib/errors';

const FOREIGN_KEY_VIOLATION = '23503';

export type NewLineItem = {
  item_code: string;
  description: string;
  volume: string;
  unit: string | null;
  unit_price: string;
  total_price: string;
};

export type LineItemRecord = NewLineItem & {
  id: string;
  project_id: string;
  created_at: string;
};

type InsertParams = {
  projectId: string;
  items: NewLineItem[];
  action: string;
  endpoint: string;
  summary: Record<string, unknown>;
};

export async function insertLineItemsWithAudit(params: InsertParams): Promise<LineItemRecord[]> {
  const { data, error } = await supabase.rpc('insert_line_items_with_audit', {
    p_project_id: params.projectId,
    p_items: params.items,
    p_action: params.action,
    p_endpoint: params.endpoint,
    p_summary: params.summary,
  });

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project does not exist');
    }
    throw error;
  }

  return data as LineItemRecord[];
}
