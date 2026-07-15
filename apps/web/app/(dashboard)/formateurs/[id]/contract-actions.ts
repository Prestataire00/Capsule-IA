'use server';

import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { resolveOrgVariables } from '@/features/documents/templates/resolve-org-variables';
import { generateTrainerContractHtml } from '@/features/documents/generate-trainer-contract';
import { wrapGeneratedHtml } from '@/features/documents/templates/wrap-generated-html';

type Result = { ok: true; documentId: string } | { ok: false; error: string };

type TrainerRow = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  siret: string | null;
  nda: string | null;
  is_internal: boolean;
  specialties: string[] | null;
};

/**
 * Génère (par IA) un contrat de sous-traitance pour un formateur et l'enregistre
 * comme document standalone (kind='trainer_contract', metadata.trainer_id). Il est
 * ensuite consultable/brandé et envoyable en signature via l'aperçu du document.
 */
export async function generateTrainerContract(trainerId: string): Promise<Result> {
  await requireAccess('dossiers', 'manage');
  const sb = supabaseServer();

  const { data } = await sb
    .schema('app')
    .from('trainers')
    .select('id, organization_id, first_name, last_name, email, phone, siret, nda, is_internal, specialties')
    .eq('id', trainerId)
    .is('deleted_at', null)
    .maybeSingle();
  const t = data as unknown as TrainerRow | null;
  if (!t) return { ok: false, error: 'trainer_not_found' };

  const orgVars = await resolveOrgVariables(sb as never, t.organization_id);
  const variables: Record<string, string> = {
    ...orgVars,
    formateur_nom: `${t.first_name} ${t.last_name}`.trim(),
    formateur_email: t.email ?? '',
    formateur_siret: t.siret ?? '',
    formateur_nda: t.nda ?? '',
    formateur_telephone: t.phone ?? '',
    formateur_specialites: (t.specialties ?? []).join(', '),
    formateur_statut: t.is_internal ? 'Formateur interne' : 'Formateur externe (indépendant)',
  };

  const gen = await generateTrainerContractHtml(variables);
  if (!gen.ok) {
    return { ok: false, error: gen.reason === 'no_api_key' ? 'ai_unavailable' : 'generation_failed' };
  }
  const html = wrapGeneratedHtml(gen.html, variables);

  const { data: inserted, error } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: t.organization_id,
      dossier_id: null,
      kind: 'trainer_contract',
      title: `Contrat de sous-traitance — ${t.first_name} ${t.last_name}`,
      status: 'ready',
      content_html: html,
      generated_at: new Date().toISOString(),
      generation_input: { ai: true, trainer_id: trainerId, model: gen.model },
      metadata: { trainer_id: trainerId },
    } as never)
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: 'document_create_failed' };

  revalidatePath(`/formateurs/${trainerId}`);
  return { ok: true, documentId: (inserted as { id: string }).id };
}
