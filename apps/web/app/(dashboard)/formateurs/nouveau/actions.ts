'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { sendTrainerInvite } from '@/features/trainers/send-trainer-invite';

const Schema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  isInternal: z.boolean(),
  siret: z.string().regex(/^\d{14}$/).optional().or(z.literal('')),
  specialties: z.array(z.string()).max(12).optional(),
  nda: z.string().trim().max(50).optional().or(z.literal('')),
  zoomUrl: z.string().trim().max(500).optional().or(z.literal('')),
  bio: z.string().trim().max(5000).optional().or(z.literal('')),
});

// Photo et CV sont déposés dès la création : le formateur est utilisable
// immédiatement dans une formation (équipe pédagogique) sans repasser par sa fiche.
const PHOTO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const CV_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** Dépose un fichier optionnel et renvoie son chemin. Un échec n'annule pas la création. */
async function uploadOptional(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  file: FormDataEntryValue | null,
  opts: { bucket: string; path: (ext: string) => string; types: Record<string, string>; maxBytes: number },
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = opts.types[file.type];
  if (!ext || file.size > opts.maxBytes) return null;

  const path = opts.path(ext);
  const { error } = await admin.storage
    .from(opts.bucket)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (error) {
    console.error(`[createTrainer] upload ${opts.bucket}`, error);
    return null;
  }
  return path;
}

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
    nda: payload.nda || undefined,
    zoomUrl: payload.zoomUrl || undefined,
    bio: payload.bio || undefined,
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
      nda: parsed.data.nda || null,
      zoom_url: parsed.data.zoomUrl || null,
      bio: parsed.data.bio || null,
    }).select('id, user_id').single();
  if (insertErr || !trainer) return { ok: false, error: 'db_insert_failed', details: insertErr?.message };

  const trainerId = trainer.id as string;
  const [photoPath, cvPath] = await Promise.all([
    uploadOptional(admin, formData.get('photo'), {
      bucket: 'trainer-photos',
      path: (ext) => `${orgId}/${trainerId}.${ext}`,
      types: PHOTO_TYPES,
      maxBytes: 2 * 1024 * 1024,
    }),
    uploadOptional(admin, formData.get('cv'), {
      bucket: 'trainer-cvs',
      path: (ext) => `${orgId}/${trainerId}/cv.${ext}`,
      types: CV_TYPES,
      maxBytes: 10 * 1024 * 1024,
    }),
  ]);
  if (photoPath || cvPath) {
    await (admin as any)
      .schema('app')
      .from('trainers')
      .update({
        ...(photoPath ? { photo_path: photoPath } : {}),
        ...(cvPath ? { cv_path: cvPath } : {}),
      })
      .eq('id', trainerId);
  }

  // Invitation systématique — y compris quand le compte existe déjà (le formateur
  // reçoit alors un lien de connexion) : il doit savoir qu'un espace l'attend.
  const { data: org } = await (admin as any)
    .schema('app')
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();

  const invite = await sendTrainerInvite({
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    orgName: (org?.name as string | null) ?? 'votre organisme de formation',
  });
  // Un échec d'envoi ne perd pas la fiche : elle est créée, l'invitation est
  // renvoyable depuis la fiche formateur.
  const invited = invite.ok;

  revalidatePath('/formateurs');
  return { ok: true, trainerId, invited };
}
