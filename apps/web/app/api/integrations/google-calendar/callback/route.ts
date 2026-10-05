import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { exchangeCodeForTokens, fetchAccountEmail } from '@/shared/lib/integrations/google-calendar-client';
import {
  readState,
  googleRedirectUri,
  saveGoogleCredsForUser,
  saveGoogleCredsForOrganization,
} from '@/shared/lib/integrations/google-calendar-store';

export const dynamic = 'force-dynamic';

const settings = (q: string) =>
  `${(env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/parametres/integrations/google-calendar${q}`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get('error')) return NextResponse.redirect(settings('?error=denied'));

  const code = sp.get('code');
  const etat = readState(sp.get('state'));
  const redirectUri = googleRedirectUri();
  if (!code || !etat || !redirectUri) return NextResponse.redirect(settings('?error=invalid_callback'));
  const { userId, pourOrganisme } = etat;

  const tokens = await exchangeCodeForTokens({ code, redirectUri });
  if (!tokens.ok) return NextResponse.redirect(settings(`?error=${tokens.error}`));

  const accountEmail = (await fetchAccountEmail(tokens.value.accessToken)) ?? '—';

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Org de l'utilisateur (pour le scope de la ligne).
  const { data: member } = await admin
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  const m = member as { organization_id: string; role: string } | null;
  const organizationId = m?.organization_id;
  if (!organizationId) return NextResponse.redirect(settings('?error=no_membership'));

  if (pourOrganisme) {
    // Le rôle est relu ici : il a pu changer pendant le passage chez Google.
    if (m.role !== 'owner' && m.role !== 'admin') return NextResponse.redirect(settings('?error=reserve_direction'));
    const enregistre = await saveGoogleCredsForOrganization(
      admin,
      { organizationId, connectedBy: userId },
      { refreshToken: tokens.value.refreshToken, accountEmail, calendarId: 'primary' },
    );
    if (!enregistre.ok) return NextResponse.redirect(settings(`?error=${encodeURIComponent(enregistre.error)}`));
    return NextResponse.redirect(settings('?connected=organisme'));
  }

  const saved = await saveGoogleCredsForUser(
    admin,
    { userId, organizationId },
    { refreshToken: tokens.value.refreshToken, accountEmail, calendarId: 'primary' },
  );
  if (!saved.ok) return NextResponse.redirect(settings(`?error=${encodeURIComponent(saved.error)}`));

  return NextResponse.redirect(settings('?connected=1'));
}
