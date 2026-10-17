import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { toRuntimeQuestion } from './template.schema';
import { codeTestPositionnement, lireTestGenere, promptTestPositionnement, titreTestPositionnement } from './test-positionnement-contenu';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type ErreurTest = 'formation_introuvable' | 'sans_objectifs' | 'ia_indisponible' | 'generation_echouee' | 'enregistrement_echoue';

/**
 * Génère (ou régénère) le test de positionnement d'une formation, d'après les
 * objectifs de son programme. Enregistré comme questionnaire de l'organisme,
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
    .select('title, objectives, organization_id')
    .eq('id', args.formationId)
    .maybeSingle();
  const f = data as { title: string; objectives: string[] | null; organization_id: string } | null;
  if (!f || f.organization_id !== args.organizationId) return { ok: false, error: 'formation_introuvable' };
  const objectifs = (f.objectives ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 20);
  if (objectifs.length === 0) return { ok: false, error: 'sans_objectifs' };

  const client = anthropic();
  if (!client) return { ok: false, error: 'ia_indisponible' };
  let questions = null;
  try {
    const msg = await client.messages
      .stream({
        model: LEGAL_MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output_config: { effort: 'medium' } as any,
        messages: [{ role: 'user', content: promptTestPositionnement(f.title, objectifs) }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .finalMessage();
    const texte = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');
    questions = lireTestGenere(texte, objectifs.length);
  } catch (e) {
    console.error('[test de positionnement] génération impossible', e instanceof Error ? e.message : e);
  }
  if (!questions) return { ok: false, error: 'generation_echouee' };

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
    description: `Deux questions par objectif du programme, à passer au démarrage de la session.`,
    schema: { questions: questions.map(toRuntimeQuestion) },
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
