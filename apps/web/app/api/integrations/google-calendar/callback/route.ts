import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { exchangeCodeForTokens, fetchAccountEmail } from '@/shared/lib/integrations/google-calendar-client';
import { verifyState, googleRedirectUri, saveGoogleCredsForUser } from '@/shared/lib/integrations/google-calendar-store';

export const dynamic = 'force-dynamic';

const settings = (q: string) =>
  `${(env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/parametres/integrations/google-calendar${q}`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get('error')) return NextResponse.redirect(settings('?error=denied'));

  const code = sp.get('code');
  const userId = verifyState(sp.get('state'));
  const redirectUri = googleRedirectUri();
  if (!code || !userId || !redirectUri) return NextResponse.redirect(settings('?error=invalid_callback'));

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
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();
  const organizationId = (member as { organization_id: string } | null)?.organization_id;
  if (!organizationId) return NextResponse.redirect(settings('?error=no_membership'));

  const saved = await saveGoogleCredsForUser(
    admin,
    { userId, organizationId },
    { refreshToken: tokens.value.refreshToken, accountEmail, calendarId: 'primary' },
  );
  if (!saved.ok) return NextResponse.redirect(settings('?error=save_failed'));

  return NextResponse.redirect(settings('?connected=1'));
}
