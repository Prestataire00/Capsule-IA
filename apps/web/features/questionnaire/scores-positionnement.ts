import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { questionsDuSchema } from './fiche-besoin';
import { scorePositionnement, type ScorePositionnement } from './score-positionnement';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

/** Clé d'un stagiaire dans un dossier (ou sans dossier, inscrit à la séance). */
export const cleStagiaire = (learnerId: string, dossierId: string | null) => `${learnerId}|${dossierId ?? ''}`;

/**
 * Le score du test de positionnement de chaque stagiaire, d'après sa dernière
 * fiche remplie : dans son dossier, ou sans dossier pour un inscrit direct.
 * Lecture en service role, bornée aux stagiaires passés par l'appelant.
 */
export async function scoresPositionnement(
  sb: Sb,
  stagiaires: ReadonlyArray<{ learnerId: string; dossierId: string | null }>,
): Promise<Map<string, ScorePositionnement>> {
  const out = new Map<string, ScorePositionnement>();
  const ids = [...new Set(stagiaires.map((s) => s.learnerId))];
  if (ids.length === 0) return out;

  const { data: a, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, dossier_id, recipient_learner_id, updated_at, template:questionnaire_templates!inner(kind, schema)')
    .in('recipient_learner_id', ids)
    .eq('status', 'completed')
    .eq('template.kind', 'positionnement')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`[positionnement] fiches illisibles : ${error.message}`);
  const fiches = (a ?? []) as unknown as Array<{
    id: string;
    dossier_id: string | null;
    recipient_learner_id: string;
    template: { kind: string; schema: unknown } | Array<{ kind: string; schema: unknown }> | null;
  }>;
  if (fiches.length === 0) return out;

  const { data: r } = await sb.schema('app').from('questionnaire_responses').select('assignment_id, answers').in('assignment_id', fiches.map((f) => f.id));
  const reponses = new Map(((r ?? []) as Array<{ assignment_id: string; answers: Record<string, unknown> | null }>).map((x) => [x.assignment_id, x.answers]));

  // Sa fiche dans son dossier, ou à défaut une fiche enregistrée sans dossier
  // (envoyée avant son rattachement : cas des stagiaires Sandaya, 2026-10-08).
  for (const s of stagiaires) {
    const cle = cleStagiaire(s.learnerId, s.dossierId);
    if (out.has(cle)) continue;
    const siennes = fiches.filter((f) => f.recipient_learner_id === s.learnerId && (f.dossier_id === s.dossierId || f.dossier_id === null));
    const f = siennes.find((x) => x.dossier_id === s.dossierId) ?? siennes[0];
    if (!f) continue;
    const modele = Array.isArray(f.template) ? f.template[0] : f.template;
    const score = scorePositionnement(questionsDuSchema(modele?.schema), reponses.get(f.id));
    if (score) out.set(cle, score);
  }
  return out;
}
