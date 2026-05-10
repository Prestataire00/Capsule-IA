'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/env.mjs';
import type { Database } from '@/shared/types/database';

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export const supabaseBrowser = () => {
  if (cached) return cached;
  cached = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return cached;
};
