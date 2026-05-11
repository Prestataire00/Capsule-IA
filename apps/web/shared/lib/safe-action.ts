import 'server-only';
import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from 'next-safe-action';
import { supabaseServer } from '@/shared/lib/supabase/server';
import type { Database } from '@/shared/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@/features/dossier/domain/ids';
import { UserId as makeUserId } from '@/features/dossier/domain/ids';

export class UnauthenticatedError extends Error {
  readonly tag = 'UnauthenticatedError';
  constructor() {
    super('Unauthenticated');
  }
}

export type AuthCtx = {
  userId: UserId;
  email: string;
  supabase: SupabaseClient<Database>;
};

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof UnauthenticatedError) return 'unauthenticated';
    console.error('[safe-action]', e);
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const supabase = supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new UnauthenticatedError();
  const ctx: AuthCtx = {
    userId: makeUserId(data.user.id),
    email: data.user.email ?? '',
    supabase,
  };
  return next({ ctx });
});
