import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env';

type RealtimeTransport = NonNullable<SupabaseClientOptions<'public'>['realtime']>['transport'];

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as unknown as RealtimeTransport },
});
