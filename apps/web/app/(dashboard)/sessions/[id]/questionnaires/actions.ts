'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { lireCleMoment } from '@/features/questionnaire/programmation-seance';
import {
  envoyerQuestionnaireSchema,
  programmerQuestionnaireSchema,
  type EnvoyerQuestionnaireInput,
  type ProgrammerQuestionnaireInput,
} from '@/features/questionnaire/programmation-seance.schema';
import { envoyerEtTracer } from '@/features/questionnaire/questionnaires-de-seance';
import { genererFicheBesoinAdaptee } from '@/features/questionnaire/fiche-besoin-ia';

/**
 * Cocher un questionnaire sur une séance, choisir son moment, l'envoyer tout de
 * suite. Réservé aux rôles qui gèrent les dossiers, pour une séance et un modèle
 * de l'organisme du membre ; l'écriture se fait ensuite en service role.
 */

type Result = { ok: true; message?: string } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

async function garde(sessionId: string, templateId: string) {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false as const, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') return { ok: false as const, error: 'Votre rôle ne permet pas de programmer un questionnaire.' };
  const [{ data: s }, { data: t }] = await Promise.all([
    admin().schema('app').from('sessions').select('organization_id').eq('id', sessionId).maybeSingle(),
    admin().schema('app').from('questionnaire_templates').select('organization_id').eq('id', templateId).is('deleted_at', null).maybeSingle(),
  ]);
  const seance = s as { organization_id: string } | null;
  const modele = t as { organization_id: string | null } | null;
  if (!seance || seance.organization_id !== membre.organizationId) return { ok: false as const, error: 'Séance introuvable.' };
  // Un modèle système (sans organisme) sert à tous ; celui d'un autre organisme, jamais.
  if (!modele || (modele.organization_id && modele.organization_id !== membre.organizationId)) {
    return { ok: false as const, error: 'Questionnaire introuvable.' };
  }
  return { ok: true as const, organizationId: membre.organizationId, userId: membre.userId };
}

async function enregistrer(args: { organizationId: string; userId: string; sessionId: string; templateId: string; moment: string; enabled: boolean }) {
  const m = lireCleMoment(args.moment);
  if (!m) return 'Moment inconnu.';
  const { error } = await admin()
    .schema('app')
    .from('session_questionnaires')
    .upsert(
      {
        organization_id: args.organizationId,
        session_id: args.sessionId,
        template_id: args.templateId,
        ancre: m.ancre,
        decalage_jours: m.decalage,
        enabled: args.enabled,
        updated_by: args.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'session_id,template_id' },
    );
  if (error) {
    console.error('[questionnaires de séance] programmation non enregistrée', error.message);
    return 'Le réglage n’a pas pu être enregistré.';
  }
  return null;
}

export async function programmerQuestionnaire(input: ProgrammerQuestionnaireInput): Promise<Result> {
  const p = programmerQuestionnaireSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const g = await garde(p.data.sessionId, p.data.templateId);
  if (!g.ok) return g;
  const erreur = await enregistrer({ ...g, ...p.data, enabled: p.data.coche });
  if (erreur) return { ok: false, error: erreur };
  revalidatePath(`/sessions/${p.data.sessionId}/questionnaires`);
  return { ok: true };
}

export async function envoyerQuestionnaireMaintenant(input: EnvoyerQuestionnaireInput): Promise<Result> {
  const p = envoyerQuestionnaireSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const g = await garde(p.data.sessionId, p.data.templateId);
  if (!g.ok) return g;
  // Envoyer, c'est aussi cocher : la ligne garde la trace de ce qui est parti.
  const erreur = await enregistrer({ ...g, ...p.data, enabled: true });
  if (erreur) return { ok: false, error: erreur };
  const r = await envoyerEtTracer(admin(), { sessionId: p.data.sessionId, templateId: p.data.templateId });
  if (r.erreurs.length) console.error('[questionnaires de séance] envoi', r.erreurs);
  revalidatePath(`/sessions/${p.data.sessionId}/questionnaires`);
  return { ok: true, message: r.bilan };
}

export type AdaptationResult = { ok: true; templateId: string } | { ok: false; error: string };

/**
 * La fiche besoin de la formation de cette séance, rédigée par l'IA (0211).
 * Elle remplace, pour cette formation, la fiche générique : c'est elle que
 * reçoivent les stagiaires, par e-mail la veille ou après leur émargement.
 * Régénérer réécrit ses questions ; l'organisme la relit ensuite dans
 * l'éditeur. Elle est aussi cochée sur la séance, à la place de la générique.
 */
export async function adapterFicheBesoin(sessionId: string): Promise<AdaptationResult> {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') return { ok: false, error: 'Votre rôle ne permet pas de modifier les questionnaires.' };

  const { data: s } = await admin().schema('app').from('sessions').select('organization_id, formation_id').eq('id', sessionId).maybeSingle();
  const seance = s as { organization_id: string; formation_id: string | null } | null;
  if (!seance || seance.organization_id !== membre.organizationId) return { ok: false, error: 'Séance introuvable.' };
  if (!seance.formation_id) return { ok: false, error: 'Rattachez d’abord une formation à la séance : la fiche s’adapte à elle.' };

  const { data: f } = await admin()
    .schema('app')
    .from('formations')
    .select('title, summary, objectives, prerequisites, target_audience')
    .eq('id', seance.formation_id)
    .maybeSingle();
  const formation = f as { title: string; summary: string | null; objectives: string[] | null; prerequisites: string[] | null; target_audience: string | null } | null;
  if (!formation) return { ok: false, error: 'Formation introuvable.' };

  const fiche = await genererFicheBesoinAdaptee({
    title: formation.title,
    summary: formation.summary,
    objectives: formation.objectives ?? [],
    prerequisites: formation.prerequisites ?? [],
    targetAudience: formation.target_audience,
  });
  if (!fiche.ok) {
    return {
      ok: false,
      error: fiche.reason === 'no_api_key' ? 'L’IA n’est pas configurée (clé ANTHROPIC_API_KEY).' : 'L’IA n’a pas pu rédiger la fiche. Réessayez.',
    };
  }

  const schema = { questions: fiche.questions };
  const { data: existante } = await admin()
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .eq('organization_id', membre.organizationId)
    .eq('formation_id', seance.formation_id)
    .eq('kind', 'positionnement')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  let templateId = (existante as { id: string } | null)?.id ?? null;
  if (templateId) {
    const { error } = await admin()
      .schema('app')
      .from('questionnaire_templates')
      .update({ schema, is_active: true, updated_at: new Date().toISOString() } as never)
      .eq('id', templateId);
    if (error) return { ok: false, error: 'La fiche n’a pas pu être enregistrée.' };
  } else {
    const { data: creee, error } = await admin()
      .schema('app')
      .from('questionnaire_templates')
      .insert({
        organization_id: membre.organizationId,
        formation_id: seance.formation_id,
        kind: 'positionnement',
        audience: 'apprenant',
        code: `fiche_besoin_${seance.formation_id.slice(0, 8)}_${Date.now().toString(36)}`,
        title: `Fiche besoin — ${formation.title}`.slice(0, 200),
        description: `Analyse des besoins adaptée à la formation « ${formation.title} ».`,
        schema,
        is_active: true,
      } as never)
      .select('id')
      .single();
    if (error || !creee) return { ok: false, error: 'La fiche n’a pas pu être enregistrée.' };
    templateId = (creee as { id: string }).id;
  }

  // Sur la séance, la fiche adaptée prend la place de la fiche générique, au même moment.
  const { data: progs } = await admin()
    .schema('app')
    .from('session_questionnaires')
    .select('template_id, ancre, decalage_jours, enabled, sent_at, template:questionnaire_templates(kind)')
    .eq('session_id', sessionId);
  const fichesCochees = ((progs ?? []) as unknown as Array<{
    template_id: string;
    ancre: string;
    decalage_jours: number;
    enabled: boolean;
    sent_at: string | null;
    template: { kind: string } | Array<{ kind: string }> | null;
  }>).filter((p) => (Array.isArray(p.template) ? p.template[0]?.kind : p.template?.kind) === 'positionnement' && p.template_id !== templateId);
  const modele = fichesCochees.find((p) => p.enabled && !p.sent_at);
  if (modele) {
    await admin()
      .schema('app')
      .from('session_questionnaires')
      .upsert(
        {
          organization_id: membre.organizationId,
          session_id: sessionId,
          template_id: templateId,
          ancre: modele.ancre,
          decalage_jours: modele.decalage_jours,
          enabled: true,
          updated_by: membre.userId,
        } as never,
        { onConflict: 'session_id,template_id' },
      );
    await admin()
      .schema('app')
      .from('session_questionnaires')
      .update({ enabled: false, updated_by: membre.userId } as never)
      .eq('session_id', sessionId)
      .in('template_id', fichesCochees.filter((p) => !p.sent_at).map((p) => p.template_id));
  }

  revalidatePath(`/sessions/${sessionId}/questionnaires`);
  revalidatePath(`/sessions/${sessionId}/fiches-besoin`);
  revalidatePath('/questionnaires');
  return { ok: true, templateId };
}
