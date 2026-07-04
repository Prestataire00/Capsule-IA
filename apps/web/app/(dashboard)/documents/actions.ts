'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

const MAX_SIZE = 20 * 1024 * 1024; // 20 Mo
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const DOC_KINDS = new Set([
  'convention',
  'convocation',
  'programme',
  'attestation_presence',
  'attestation_fin',
  'certificat_realisation',
  'reglement_interieur',
  'livret_accueil',
  'devis',
  'facture',
  'feuille_emargement',
  'questionnaire',
  'autre',
]);

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as never as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            is: (k: string, v: null) => {
              order: (k: string, o: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: { organization_id: string; role: string } | null }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id;
}

async function requireOrg(): Promise<string> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) redirect('/documents?error=forbidden');
  return orgId;
}

// Téléverse un document « libre » (sans dossier). Rattachable ensuite à un dossier.
export async function uploadStandaloneDocument(fd: FormData): Promise<void> {
  const orgId = await requireOrg();

  const title = (fd.get('title') as string | null)?.trim();
  const kindRaw = (fd.get('kind') as string | null)?.trim() || 'autre';
  const kind = DOC_KINDS.has(kindRaw) ? kindRaw : 'autre';
  const file = fd.get('file');
  if (!title) redirect('/documents?error=missing_title');
  if (!(file instanceof File) || file.size === 0) redirect('/documents?error=missing_file');
  if (file.size > MAX_SIZE) redirect('/documents?error=file_too_large');
  if (!ALLOWED.has(file.type)) redirect('/documents?error=invalid_type');

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin';
  const storagePath = `${orgId}/org/${kind}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = supabaseAdmin();
  const { error: upErr } = await admin.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (upErr) redirect(`/documents?error=${encodeURIComponent(upErr.message)}`);

  const { error } = await admin.schema('app').from('documents').insert({
    organization_id: orgId,
    dossier_id: null,
    kind,
    title,
    status: 'ready',
    storage_path: storagePath,
    mime_type: file.type,
    file_size_bytes: file.size,
    generated_at: new Date().toISOString(),
  } as never);
  if (error) redirect(`/documents?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/documents');
  redirect('/documents?tab=generes&created=1');
}

// Rattache un document existant à un dossier (renseigne dossier_id).
export async function attachDocumentToDossier(fd: FormData): Promise<void> {
  const orgId = await requireOrg();
  const documentId = (fd.get('documentId') as string | null)?.trim();
  const dossierId = (fd.get('dossierId') as string | null)?.trim();
  if (!documentId || !dossierId) redirect('/documents?error=invalid');

  const admin = supabaseAdmin();
  // Vérifie que le dossier appartient à l'org (anti cross-tenant).
  const { data: dossier } = await admin
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('id', dossierId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!dossier) redirect('/documents?error=dossier_not_found');

  const { error } = await admin
    .schema('app')
    .from('documents')
    .update({ dossier_id: dossierId, updated_at: new Date().toISOString() } as never)
    .eq('id', documentId)
    .eq('organization_id', orgId);
  if (error) redirect(`/documents?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/documents');
  redirect(`/dossiers/${dossierId}/documents`);
}
