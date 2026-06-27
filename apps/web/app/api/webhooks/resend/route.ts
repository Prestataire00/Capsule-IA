// ARCHETYPE: command
// Webhook Resend : met à jour app.email_log (delivered / opened / clicked / bounced /
// complained) en matchant provider_id = data.email_id. Signature Svix vérifiée manuellement.
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Vérifie la signature Svix (format des webhooks Resend). */
function verifySvix(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const expectedBuf = Buffer.from(expected);

  // svix-signature : "v1,<sig> v1,<sig2> …"
  return signature.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

type ResendEvent = {
  type?: string;
  data?: { email_id?: string };
};

export async function POST(req: Request): Promise<Response> {
  const secret = env.RESEND_WEBHOOK_SECRET;
  // Feature désactivée tant que le secret n'est pas configuré : on renvoie 200
  // pour éviter les retances de Resend, sans rien traiter.
  if (!secret) return NextResponse.json({ ok: true, skipped: 'no_secret' });

  const body = await req.text();
  if (!verifySvix(secret, req.headers, body)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  const type = event.type;
  if (!emailId || !type) return NextResponse.json({ ok: true, skipped: 'no_email_id' });

  const sb = admin();
  const { data: row } = await sb
    .schema('app')
    .from('email_log')
    .select('id, open_count, click_count')
    .eq('provider_id', emailId)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: true, skipped: 'unknown_email' });

  const current = row as { id: string; open_count: number | null; click_count: number | null };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  switch (type) {
    case 'email.delivered':
      patch.delivered_at = now;
      break;
    case 'email.opened':
      patch.opened_at = now;
      patch.open_count = (current.open_count ?? 0) + 1;
      break;
    case 'email.clicked':
      patch.clicked_at = now;
      patch.click_count = (current.click_count ?? 0) + 1;
      break;
    case 'email.bounced':
      patch.bounced_at = now;
      break;
    case 'email.complained':
      patch.complained_at = now;
      break;
    default:
      return NextResponse.json({ ok: true, skipped: `ignored_${type}` });
  }

  const { error } = await sb.schema('app').from('email_log').update(patch).eq('id', current.id);
  if (error) {
    console.error('[resend-webhook] update failed', error);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
