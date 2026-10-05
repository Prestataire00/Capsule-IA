import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { env } from '@/env.mjs';
import { googleOAuthAuthorizeUrl } from '@/shared/lib/integrations/google-calendar-client';
import {
  signState,
  signOrganisationState,
  googleRedirectUri,
} from '@/shared/lib/integrations/google-calendar-store';

export const dynamic = 'force-dynamic';

const settings = (q: string) =>
  `${(env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/parametres/integrations/google-calendar${q}`;

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Tout membre relie son propre Google Agenda ; la boîte formateur de
  // l'organisme (?cible=organisme) se relie par la direction seule.
  const { data: member } = await sb
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  const m = member as { organization_id: string; role: string } | null;
  if (!m?.organization_id) {
    return NextResponse.json({ error: 'no_membership' }, { status: 403 });
  }
  const pourOrganisme = req.nextUrl.searchParams.get('cible') === 'organisme';
  if (pourOrganisme && m.role !== 'owner' && m.role !== 'admin') {
    return NextResponse.redirect(settings('?error=reserve_direction'));
  }

  const redirectUri = googleRedirectUri();
  if (!redirectUri || !env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(settings('?error=not_configured'));
  }
  const state = pourOrganisme ? signOrganisationState(auth.user.id) : signState(auth.user.id);
  const url = googleOAuthAuthorizeUrl({ state, redirectUri, envoi: pourOrganisme });
  if (!url) return NextResponse.redirect(settings('?error=not_configured'));
  return NextResponse.redirect(url);
}
