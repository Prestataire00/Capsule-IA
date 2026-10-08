import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { questionnaireEmail } from '@/shared/lib/email/questionnaire-email';
import { envoyerDepuisLOrganisme } from '@/features/sessions/visio';
import { interlocuteurDuModele } from './cartographie';
import { lienStagiaire } from './lien-stagiaire';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type EnvoiApprenant =
  | { ok: true; lien: string; envoye: boolean; email: string | null }
  | { ok: false; error: 'pas_du_dossier' | 'modele_introuvable' | 'deja_repondu' | 'adresse_publique_absente' | 'creation_impossible' };

/**
 * Un questionnaire à UN apprenant du dossier, quel qu'il soit (demande
 * d'Ismael, 2026-10-08 : Guilhem n'avait pas eu la satisfaction à chaud). Sa
 * réponse est reprise si elle existe déjà, créée sinon ; le lien part par
 * e-mail quand il a une adresse, et revient à l'écran dans tous les cas.
 */
export async function envoyerQuestionnaireAUnApprenant(
  sb: Sb,
  args: { organizationId: string; dossierId: string; learnerId: string; templateId: string },
): Promise<EnvoiApprenant> {
  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (!base) return { ok: false, error: 'adresse_publique_absente' };

  const [{ data: apprenants }, { data: t }, { data: l }, { data: d }, { data: o }] = await Promise.all([
    sb.schema('app').rpc('dossier_apprenants', { p_dossier_id: args.dossierId }),
    sb.schema('app').from('questionnaire_templates').select('id, title, kind, code, audience, organization_id').eq('id', args.templateId).is('deleted_at', null).maybeSingle(),
    sb.schema('app').from('learners').select('first_name, last_name, email').eq('id', args.learnerId).maybeSingle(),
    sb.schema('app').from('dossiers').select('formation:formations(title)').eq('id', args.dossierId).maybeSingle(),
    sb.schema('app').from('organizations').select('name').eq('id', args.organizationId).maybeSingle(),
  ]);
  if (!((apprenants ?? []) as Array<{ learner_id: string }>).some((a) => a.learner_id === args.learnerId)) return { ok: false, error: 'pas_du_dossier' };
  const modele = t as { id: string; title: string; kind: string; code: string | null; audience: string | null; organization_id: string | null } | null;
  if (!modele || (modele.organization_id && modele.organization_id !== args.organizationId) || interlocuteurDuModele(modele) !== 'apprenant') {
    return { ok: false, error: 'modele_introuvable' };
  }
  const apprenant = l as { first_name: string | null; last_name: string | null; email: string | null } | null;

  const { data: existante } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status')
    .eq('template_id', args.templateId)
    .eq('dossier_id', args.dossierId)
    .eq('recipient_kind', 'learner')
    .eq('recipient_learner_id', args.learnerId)
    .neq('status', 'expired')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const deja = existante as { id: string; status: string } | null;
  if (deja?.status === 'completed') return { ok: false, error: 'deja_repondu' };
  let assignmentId = deja?.id ?? null;
  if (!assignmentId) {
    const { data: creee, error } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .insert({
        organization_id: args.organizationId,
        template_id: args.templateId,
        dossier_id: args.dossierId,
        recipient_kind: 'learner',
        recipient_learner_id: args.learnerId,
        recipient_email: apprenant?.email ?? null,
        recipient_name: `${apprenant?.first_name ?? ''} ${apprenant?.last_name ?? ''}`.trim() || null,
        token_hash: createHash('sha256').update(randomBytes(24)).digest('hex'),
        status: 'pending',
      })
      .select('id')
      .single();
    if (error || !creee) {
      console.error('[questionnaire] envoi individuel impossible', error?.message);
      return { ok: false, error: 'creation_impossible' };
    }
    assignmentId = (creee as { id: string }).id;
  }

  const lien = await lienStagiaire(base, 'questionnaire', { learnerId: args.learnerId, organizationId: args.organizationId, dossierId: args.dossierId, cibleId: assignmentId });
  const email = apprenant?.email?.trim() || null;
  let envoye = false;
  if (email) {
    const f = d as { formation: { title: string | null } | Array<{ title: string | null }> | null } | null;
    const formation = (Array.isArray(f?.formation) ? f?.formation[0]?.title : f?.formation?.title) ?? null;
    const tpl = questionnaireEmail({
      destinataire: 'apprenant',
      prenom: apprenant?.first_name ?? null,
      titreQuestionnaire: modele.title,
      formationTitle: formation,
      organisme: (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
      url: lien,
    });
    const r = await envoyerDepuisLOrganisme(sb, args.organizationId, {
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      dossierId: args.dossierId,
      kind: 'questionnaire_apprenant',
      metadata: { assignment_id: assignmentId, template_id: args.templateId, envoi: 'individuel' },
    });
    envoye = r.ok;
    if (!r.ok && r.reason !== 'no_api_key') console.error('[questionnaire] e-mail individuel non parti', assignmentId, r.reason);
  }
  return { ok: true, lien, envoye, email };
}

/**
 * Les stagiaires du dossier (groupe compris), pour en viser un. Lus en service :
 * la fonction de la liste n'est pas ouverte aux membres ; l'appelant a lu le
 * dossier sous ses droits.
 */
export async function apprenantsDuDossier(dossierId: string): Promise<Array<{ id: string; nom: string; email: string | null }>> {
  const sb = supabaseAdmin() as unknown as Sb;
  const { data: liste } = await sb.schema('app').rpc('dossier_apprenants', { p_dossier_id: dossierId });
  const ids = [...new Set(((liste ?? []) as Array<{ learner_id: string }>).map((x) => x.learner_id))];
  if (ids.length === 0) return [];
  const { data } = await sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', ids).order('last_name', { ascending: true });
  return ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((l) => ({
    id: l.id,
    nom: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Apprenant',
    email: l.email,
  }));
}
