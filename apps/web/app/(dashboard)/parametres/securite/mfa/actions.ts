// ARCHETYPE: command (server actions MFA)
// Cf. FR-004, sprint plan V2 STORY-A3.
//
// Note V1 : utilise Supabase Auth MFA API native (auth.mfa.enroll/verify/unenroll).
// Recovery codes NON implémentés V1 (à ajouter V1.5).

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

type EnrollOk = {
  ok: true;
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};
type EnrollErr = { ok: false; error: string };

export async function enrollMfaAction(): Promise<EnrollOk | EnrollErr> {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: 'not_authenticated' };

  // Si un facteur unverified existe déjà → le nettoyer pour éviter accumulation
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  for (const f of factorsData?.totp ?? []) {
    if (f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `TOTP ${new Date().toISOString().slice(0, 10)}`,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'enroll_failed' };
  }

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

const verifySchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres requis'),
});

type VerifyOk = { ok: true };
type VerifyErr = { ok: false; error: string };

export async function verifyMfaAction(input: unknown): Promise<VerifyOk | VerifyErr> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'invalid_input' };
  }

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: 'not_authenticated' };

  // Challenge → verify
  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
    factorId: parsed.data.factorId,
  });
  if (challengeErr || !challenge) {
    return { ok: false, error: challengeErr?.message ?? 'challenge_failed' };
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: challenge.id,
    code: parsed.data.code,
  });

  if (verifyErr) {
    return { ok: false, error: verifyErr.message };
  }

  // Audit trail via service_role (pas de RLS sur audit.audit_log)
  const admin = supabaseAdmin();
  await admin.schema('audit').from('audit_log').insert({
    actor_user_id: user.id,
    action: 'mfa.enabled',
    target_type: 'auth.users',
    target_id: user.id,
    metadata: { factor_id: parsed.data.factorId },
  } as never);

  revalidatePath('/parametres/securite/mfa');
  revalidatePath('/parametres/securite');
  return { ok: true };
}

const disableSchema = z.object({
  factorId: z.string().uuid(),
});

export async function disableMfaAction(input: unknown): Promise<VerifyOk | VerifyErr> {
  const parsed = disableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: 'not_authenticated' };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (error) return { ok: false, error: error.message };

  // Audit + TODO Sprint A : notifier tous les owners de l'OF par email
  const admin = supabaseAdmin();
  await admin.schema('audit').from('audit_log').insert({
    actor_user_id: user.id,
    action: 'mfa.disabled',
    target_type: 'auth.users',
    target_id: user.id,
    metadata: { factor_id: parsed.data.factorId, warning: 'notification owners TODO' },
  } as never);

  revalidatePath('/parametres/securite/mfa');
  revalidatePath('/parametres/securite');
  return { ok: true };
}
