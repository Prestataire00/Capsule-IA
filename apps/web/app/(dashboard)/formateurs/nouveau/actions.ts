'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';

const Schema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  isInternal: z.boolean(),
  siret: z.string().regex(/^\d{14}$/).optional().or(z.literal('')),
  specialties: z.array(z.string()).max(12).optional(),
});

export type CreateTrainerResult =
  | { ok: true; trainerId: string; invited: boolean }
  | { ok: false; error: string; details?: unknown };

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as any)
    .schema('app').from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id as string;
}

export async function createTrainer(formData: FormData): Promise<CreateTrainerResult> {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

  const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = Schema.safeParse({
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email?.toLowerCase().trim(),
    phone: payload.phone || undefined,
    isInternal: payload.isInternal === 'true' || payload.isInternal === 'on',
    siret: payload.siret || undefined,
    specialties: payload.specialties ? JSON.parse(payload.specialties) : undefined,
  });
  if (!parsed.success) return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };

  const admin = supabaseAdmin();

  const { data: trainer, error: insertErr } = await (admin as any)
    .schema('app').from('trainers').insert({
      organization_id: orgId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      is_internal: parsed.data.isInternal,
      siret: parsed.data.siret ?? null,
      specialties: parsed.data.specialties ?? [],
    }).select('id, user_id').single();
  if (insertErr || !trainer) return { ok: false, error: 'db_insert_failed', details: insertErr?.message };

  let invited = false;
  if (!trainer.user_id) {
    // user_id NULL après autolink → user n'existe pas → invite magic link
    const appUrl = process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
    const redirectTo = `${appUrl}/formateur`;
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo });
    if (inviteErr) {
      console.error('[createTrainer] invite failed', inviteErr);
      // Garde la fiche, l'admin pourra renvoyer l'invite plus tard
    } else {
      invited = true;
    }
  }

  revalidatePath('/formateurs');
  return { ok: true, trainerId: trainer.id as string, invited };
}
