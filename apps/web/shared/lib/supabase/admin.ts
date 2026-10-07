import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import type { Database } from '@/shared/types/database';

/**
 * BYPASS RLS. Strictement réservé : Edge Fn handlers, anonymisation RGPD,
 * webhooks signés. Ne JAMAIS importer depuis un client component.
 */
/**
 * Jamais de cache Next sur une lecture de la base : dans une route GET, Next
 * gardait la réponse d'une requête et la resservait (horaires de séance
 * périmés dans une route de l'espace entreprise, constaté le 2026-10-07).
 */
const sansCache: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

export const supabaseAdmin = () =>
  createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: sansCache } },
  );
