import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { env } from '@/env.mjs';
import { googleOAuthAuthorizeUrl } from '@/shared/lib/integrations/google-calendar-client';
import { signState, googleRedirectUri } from '@/shared/lib/integrations/google-calendar-store';

export const dynamic = 'force-dynamic';

const settings = (q: string) =>
  `${(env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/parametres/integrations/google-calendar${q}`;

export async function GET(_req: NextRequest) {
  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Connexion par utilisateur : tout membre relie son propre Google Agenda.
  const { data: member } = await sb
    .schema('app')
    .from('members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!(member as { organization_id: string } | null)?.organization_id) {
    return NextResponse.json({ error: 'no_membership' }, { status: 403 });
  }

  const redirectUri = googleRedirectUri();
  if (!redirectUri || !env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(settings('?error=not_configured'));
  }
  const url = googleOAuthAuthorizeUrl({ state: signState(auth.user.id), redirectUri });
  if (!url) return NextResponse.redirect(settings('?error=not_configured'));
  return NextResponse.redirect(url);
}
