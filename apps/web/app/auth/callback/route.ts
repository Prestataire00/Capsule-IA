import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { publicOrigin } from '@/shared/lib/http/public-origin';

/** N'autorise qu'une redirection interne (même origine). */
function safeNext(target: string | null): string {
  if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  return '/';
}

/**
 * Point d'atterrissage des liens email Supabase (récupération de mot de passe,
 * magic link). Échange le `code` (PKCE) ou le `token_hash` (OTP) contre une
 * session, puis redirige vers `next`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const sb = supabaseServer();
  let failed = false;

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    failed = !!error;
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({
      type: type as 'recovery' | 'email' | 'magiclink' | 'invite' | 'signup',
      token_hash: tokenHash,
    });
    failed = !!error;
  } else {
    failed = true;
  }

  const dest = new URL(failed ? '/auth/reset-password?error=1' : next, publicOrigin(req));
  return NextResponse.redirect(dest);
}
