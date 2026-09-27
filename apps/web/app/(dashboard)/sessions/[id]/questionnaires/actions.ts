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
