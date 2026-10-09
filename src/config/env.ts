import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.url(),
  SUPABASE_KEY: z.string().min(1),
  API_SECRET: z.string().min(16),
});

export const env = schema.parse(process.env);
