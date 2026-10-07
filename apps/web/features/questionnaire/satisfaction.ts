import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateSatisfactionUrl } from '@/shared/lib/satisfaction-token';
import { interlocuteurDuModele } from './cartographie';
import { lienStagiaire } from './lien-stagiaire';

/**
 * Le questionnaire de satisfaction à chaud d'UN stagiaire pour UN dossier :
 * le même, qu'il parte par e-mail en fin de formation ou qu'on le projette en
 * salle. Une assignation par stagiaire — dans un dossier de groupe, chacun la
 * sienne — rattachée au dossier, ce que compte l'indicateur Qualiopi.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export const SATISFACTION_TEMPLATE_CODE = 'satisfaction_chaud_default';

export async function ensureSatisfactionTemplate(sb: Sb): Promise<string> {
  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .is('organization_id', null)
    .eq('code', SATISFACTION_TEMPLATE_CODE)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .insert({
      organization_id: null,
      kind: 'satisfaction_chaud',
      code: SATISFACTION_TEMPLATE_CODE,
      title: 'Satisfaction à chaud — Qualiopi',
      schema: {
        version: 1,
        fields: [
          { key: 'nps', kind: 'nps' },
          { key: 'overallRating', kind: 'rating_5' },
          { key: 'pedagogyRating', kind: 'rating_5' },
          { key: 'organizationRating', kind: 'rating_5' },
          { key: 'whatWorked', kind: 'long_text' },
          { key: 'whatToImprove', kind: 'long_text' },
        ],
      },
      is_active: true,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`[satisfaction] modèle non créé : ${error?.message ?? 'inconnu'}`);
  return (created as { id: string }).id;
}

/**
 * Le questionnaire de satisfaction à chaud de l'organisme : le sien quand il
 * en a créé un (destiné aux stagiaires, valable pour toutes les formations),
 * sinon le questionnaire intégré. Demande d'Ismael, 2026-10-07 : un seul
 * questionnaire de satisfaction, le sien, partout — e-mail de fin, QR projeté,
 * liens transmis à l'entreprise.
 */
export async function modeleSatisfaction(sb: Sb, organizationId: string): Promise<{ id: string; generique: boolean }> {
  const { data } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, kind, code, audience')
    .eq('organization_id', organizationId)
    .eq('kind', 'satisfaction_chaud')
    .eq('is_active', true)
    .is('deleted_at', null)
    .is('formation_id', null)
    .order('updated_at', { ascending: false });
  const propre = ((data ?? []) as Array<{ id: string; kind: string; code: string | null; audience: string | null }>).find(
    (m) => interlocuteurDuModele(m) === 'apprenant',
  );
  if (propre) return { id: propre.id, generique: false };
  return { id: await ensureSatisfactionTemplate(sb), generique: true };
}

export async function assignationSatisfaction(
  sb: Sb,
  args: { organizationId: string; dossierId: string; learnerId: string },
): Promise<{ assignmentId: string; complete: boolean; generique: boolean }> {
  const modele = await modeleSatisfaction(sb, args.organizationId);
  const templateId = modele.id;
  const generiqueId = modele.generique ? templateId : await ensureSatisfactionTemplate(sb);
  // Déjà répondu à l'un ou l'autre (avant le changement de questionnaire) : on ne redemande pas.
  const { data: existantes } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, template_id')
    .in('template_id', [...new Set([templateId, generiqueId])])
    .eq('dossier_id', args.dossierId)
    .eq('recipient_kind', 'learner')
    .eq('recipient_learner_id', args.learnerId)
    .neq('status', 'expired');
  const lignes = (existantes ?? []) as Array<{ id: string; status: string; template_id: string }>;
  const remplie = lignes.find((l) => l.status === 'completed');
  if (remplie) return { assignmentId: remplie.id, complete: true, generique: remplie.template_id === generiqueId };
  const ouverte = lignes.find((l) => l.template_id === templateId);
  if (ouverte) return { assignmentId: ouverte.id, complete: false, generique: modele.generique };

  const { data: created, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .insert({
      organization_id: args.organizationId,
      template_id: templateId,
      dossier_id: args.dossierId,
      recipient_kind: 'learner',
      recipient_learner_id: args.learnerId,
      token_hash: createHash('sha256').update(randomBytes(24)).digest('hex'),
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`[satisfaction] assignation non créée : ${error?.message ?? 'inconnu'}`);
  return { assignmentId: (created as { id: string }).id, complete: false, generique: modele.generique };
}

/** Le lien de réponse du stagiaire (la page dit « déjà répondu » s'il l'a fait). */
export async function lienSatisfaction(
  sb: Sb,
  args: { organizationId: string; dossierId: string; learnerId: string },
): Promise<string | null> {
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return null;
  const { assignmentId, generique } = await assignationSatisfaction(sb, args);
  // Le questionnaire de l'organisme se remplit sur la page commune à tous les questionnaires.
  if (!generique) return lienStagiaire(base, 'questionnaire', { ...args, cibleId: assignmentId });
  return (await generateSatisfactionUrl({ assignmentId, ...args }, base)).url;
}
