import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import type { Database } from '@/shared/types/database';

/**
 * BYPASS RLS. Strictement réservé : Edge Fn handlers, anonymisation RGPD,
 * webhooks signés. Ne JAMAIS importer depuis un client component.
 */
export const supabaseAdmin = () =>
  createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
