import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { toRuntimeQuestion } from './template.schema';
import { PREFIXE_TEST_POSITIONNEMENT, scoreTest, type ScoreTest, codeTestPositionnement, lireProgramme, lireTestGenere, nombreAttendu, promptTestPositionnement, titreTestPositionnement, type ContenuFormation } from './test-positionnement-contenu';
import { loadProgrammePourFormateur } from '@/features/formations/programme/load-for-trainer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type ErreurTest = 'formation_introuvable' | 'sans_objectifs' | 'ia_indisponible' | 'generation_echouee' | 'enregistrement_echoue';

/**
 * Génère (ou régénère) le test de positionnement d'une formation, d'après son
 * contenu pédagogique, son programme détaillé et ses modalités. Enregistré comme questionnaire de l'organisme,
 * rattaché à la formation : il se projette en QR code au démarrage de chaque
 * séance de cette formation, ou se saisit à la main. Il ne part par e-mail que
 * si on le programme : le test se passe en salle.
 * L'appelant a vérifié que la formation appartient à l'organisme.
 */
export async function genererTestPositionnement(
  sb: Sb,
  args: { organizationId: string; formationId: string },
): Promise<{ ok: true; templateId: string; questions: number } | { ok: false; error: ErreurTest }> {
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('title, summary, description, objectives, organization_id, default_modality, default_duration_hours, pedagogical_method, evaluation_method')
    .eq('id', args.formationId)
    .maybeSingle();
  const f = data as {
    title: string;
    summary: string | null;
    description: string | null;
    objectives: string[] | null;
    organization_id: string;
    default_modality: string | null;
    default_duration_hours: number | string | null;
    pedagogical_method: string | null;
    evaluation_method: string | null;
  } | null;
  if (!f || f.organization_id !== args.organizationId) return { ok: false, error: 'formation_introuvable' };

  // Le contenu pédagogique, le programme détaillé et les modalités (17/10/2026).
  const programme = lireProgramme(await loadProgrammePourFormateur(args.formationId));
  const contenu: ContenuFormation = {
    titre: f.title,
    resume: f.summary?.trim() || f.description?.trim().slice(0, 1500) || null,
    modalite: f.default_modality,
    dureeHeures: f.default_duration_hours == null ? null : Number(f.default_duration_hours),
    methodePedagogique: f.pedagogical_method,
    methodeEvaluation: f.evaluation_method,
    objectifs: (f.objectives ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 20),
    modules: programme.modules.slice(0, 15),
    programmeTexte: programme.texte,
  };
  if (contenu.modules.length === 0 && !contenu.programmeTexte && contenu.objectifs.length === 0 && !contenu.resume) {
    return { ok: false, error: 'sans_objectifs' };
  }

  const client = anthropic();
  if (!client) return { ok: false, error: 'ia_indisponible' };
  let genere = null;
  try {
    const msg = await client.messages
      .stream({
        model: LEGAL_MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output_config: { effort: 'medium' } as any,
        messages: [{ role: 'user', content: promptTestPositionnement(contenu) }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .finalMessage();
    const texte = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');
    genere = lireTestGenere(texte, nombreAttendu(contenu));
  } catch (e) {
    console.error('[test de positionnement] génération impossible', e instanceof Error ? e.message : e);
  }
  if (!genere) return { ok: false, error: 'generation_echouee' };
  const { questions, corrections } = genere;

  const code = codeTestPositionnement(args.formationId);
  const ligne = {
    organization_id: args.organizationId,
    formation_id: args.formationId,
    code,
    // « Évaluation des acquis » : un test de connaissances. Le ranger en
    // « positionnement » le confondrait avec la fiche besoin.
    kind: 'evaluation_acquis',
    audience: 'apprenant',
    title: titreTestPositionnement(f.title),
    description: 'Construit sur le programme, le contenu et les modalités de la formation ; passé au premier cours du groupe.',
    // Les bonnes réponses restent dans le modèle, jamais montrées au stagiaire.
    schema: { questions: questions.map(toRuntimeQuestion), corrections },
    thank_you_message: 'Merci ! Votre formateur adaptera la formation à vos réponses.',
    is_active: true,
    deleted_at: null,
  };
  const { data: existant } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('code', code)
    .maybeSingle();
  const r = existant
    ? await sb.schema('app').from('questionnaire_templates').update(ligne as never).eq('id', (existant as { id: string }).id).select('id').single()
    : await sb.schema('app').from('questionnaire_templates').insert(ligne as never).select('id').single();
  if (r.error || !r.data) {
    console.error('[test de positionnement] enregistrement impossible', r.error?.message);
    return { ok: false, error: 'enregistrement_echoue' };
  }
  return { ok: true, templateId: (r.data as { id: string }).id, questions: questions.length };
}

/** Le test de positionnement de ces formations, s'il existe. */
export async function testsDePositionnement(sb: Sb, organizationId: string, formationIds: readonly string[]): Promise<Array<{ id: string; title: string; formationId: string }>> {
  const ids = [...new Set(formationIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, formation_id')
    .eq('organization_id', organizationId)
    .in('code', ids.map(codeTestPositionnement))
    .eq('is_active', true)
    .is('deleted_at', null);
  return ((data ?? []) as Array<{ id: string; title: string; formation_id: string }>).map((t) => ({ id: t.id, title: t.title, formationId: t.formation_id }));
}

/**
 * Le score de chaque stagiaire au test de positionnement passé en salle :
 * dans son dossier, ou sans dossier. Lecture en service role, bornée aux
 * stagiaires passés par l'appelant.
 */
export async function scoresTestPositionnement(
  sb: Sb,
  stagiaires: ReadonlyArray<{ learnerId: string; dossierId: string | null }>,
): Promise<Map<string, ScoreTest>> {
  const out = new Map<string, ScoreTest>();
  const ids = [...new Set(stagiaires.map((s) => s.learnerId))];
  if (ids.length === 0) return out;
  const { data: a, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, dossier_id, recipient_learner_id, template:questionnaire_templates!inner(code, schema)')
    .in('recipient_learner_id', ids)
    .eq('status', 'completed')
    .like('template.code', `${PREFIXE_TEST_POSITIONNEMENT}%`)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`[test de positionnement] réponses illisibles : ${error.message}`);
  const tests = (a ?? []) as unknown as Array<{
    id: string;
    dossier_id: string | null;
    recipient_learner_id: string;
    template: { schema: unknown } | Array<{ schema: unknown }> | null;
  }>;
  if (tests.length === 0) return out;
  const { data: r } = await sb.schema('app').from('questionnaire_responses').select('assignment_id, answers').in('assignment_id', tests.map((t) => t.id));
  const reponses = new Map(((r ?? []) as Array<{ assignment_id: string; answers: Record<string, unknown> | null }>).map((x) => [x.assignment_id, x.answers]));
  for (const s of stagiaires) {
    const cle = `${s.learnerId}|${s.dossierId ?? ''}`;
    const siens = tests.filter((t) => t.recipient_learner_id === s.learnerId && (t.dossier_id === s.dossierId || t.dossier_id === null));
    const t = siens.find((x) => x.dossier_id === s.dossierId) ?? siens[0];
    if (!t) continue;
    const modele = Array.isArray(t.template) ? t.template[0] : t.template;
    const score = scoreTest(modele?.schema as never, reponses.get(t.id));
    if (score) out.set(cle, score);
  }
  return out;
}
