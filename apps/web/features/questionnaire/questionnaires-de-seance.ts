import 'server-only';
// Les questionnaires cochés sur les séances (0197) : lecture, et passage du cron.

import type { SupabaseClient } from '@supabase/supabase-js';
import { estDu, type Ancre } from './programmation-seance';
import { envoyerQuestionnaireSeance, resumerBilan } from './envoyer-questionnaire-seance';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type Programmation = {
  template_id: string;
  ancre: Ancre;
  decalage_jours: number;
  enabled: boolean;
  sent_at: string | null;
  bilan: string | null;
};

export async function programmationsDeLaSeance(sb: Client, sessionId: string): Promise<Map<string, Programmation>> {
  const { data, error } = await sb
    .schema('app')
    .from('session_questionnaires')
    .select('template_id, ancre, decalage_jours, enabled, sent_at, bilan')
    .eq('session_id', sessionId);
  if (error) console.error('[questionnaires de séance] lecture impossible', sessionId, error.message);
  return new Map(((data ?? []) as Programmation[]).map((p) => [p.template_id, p]));
}

/** Envoie et trace. `sent_at` fait foi : le cron ne repart pas deux fois. */
export async function envoyerEtTracer(sb: Client, args: { sessionId: string; templateId: string }): Promise<{ bilan: string; envoyes: number; erreurs: string[] }> {
  const b = await envoyerQuestionnaireSeance(sb, args);
  const bilan = resumerBilan(b);
  const { error } = await sb
    .schema('app')
    .from('session_questionnaires')
    .update({ sent_at: new Date().toISOString(), bilan, updated_at: new Date().toISOString() } as never)
    .eq('session_id', args.sessionId)
    .eq('template_id', args.templateId);
  if (error) console.error('[questionnaires de séance] envoi non tracé', args, error.message);
  return { bilan, envoyes: b.envoyes, erreurs: b.erreurs.map((e) => `questionnaire ${args.sessionId} : ${e}`) };
}

/** Passage quotidien : chaque questionnaire coché part le jour dit. */
export async function runQuestionnairesDeSeance(sb: Client, maintenant = new Date()): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const { data, error } = await sb
    .schema('app')
    .from('session_questionnaires')
    .select('session_id, template_id, ancre, decalage_jours, session:sessions(starts_at, ends_at, status)')
    .eq('enabled', true)
    .is('sent_at', null);
  if (error) return { candidates: 0, sent: 0, errors: [`questionnaires de séance : ${error.message}`] };

  type Ligne = {
    session_id: string;
    template_id: string;
    ancre: Ancre;
    decalage_jours: number;
    session: { starts_at: string; ends_at: string; status: string } | { starts_at: string; ends_at: string; status: string }[] | null;
  };
  const dues = ((data ?? []) as unknown as Ligne[]).filter((l) => {
    const s = Array.isArray(l.session) ? l.session[0] : l.session;
    if (!s || s.status === 'cancelled') return false;
    return estDu({ startsAt: s.starts_at, endsAt: s.ends_at }, { ancre: l.ancre, decalage: l.decalage_jours }, maintenant);
  });

  let sent = 0;
  const errors: string[] = [];
  for (const l of dues) {
    const r = await envoyerEtTracer(sb, { sessionId: l.session_id, templateId: l.template_id });
    sent += r.envoyes;
    errors.push(...r.erreurs);
  }
  return { candidates: dues.length, sent, errors };
}
