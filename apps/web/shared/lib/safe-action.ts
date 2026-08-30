import 'server-only';
import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from 'next-safe-action';
import { supabaseServer } from '@/shared/lib/supabase/server';
import type { UserId } from '@/features/dossier/domain/ids';
import { UserId as makeUserId } from '@/features/dossier/domain/ids';
import type { ServerSupabase } from '@/shared/lib/supabase/client-type';

export class UnauthenticatedError extends Error {
  readonly tag = 'UnauthenticatedError';
  constructor() {
    super('Unauthenticated');
  }
}

export type AuthCtx = {
  userId: UserId;
  email: string;
  // Typé par inférence : `ServerSupabase` fige une arité de génériques
  // qui a changé côté supabase-js, d'où une incompatibilité à chaque montée de
  // version. Le type suit désormais la fabrique.
  supabase: ReturnType<typeof supabaseServer>;
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
