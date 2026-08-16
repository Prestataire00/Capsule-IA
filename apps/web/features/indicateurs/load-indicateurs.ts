import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Indicateurs de résultats (Qualiopi indicateur 2 : « publicité des résultats »).
 *
 * Tout est calculé depuis les données réelles de la plateforme — aucun chiffre
 * n'est saisi à la main : les apprenants viennent des dossiers terminés, la
 * satisfaction des questionnaires renseignés (score sur 100, cf. `avgRating * 20`
 * des formulaires de satisfaction).
 */
export type FormationIndicator = {
  formationId: string;
  title: string;
  learners: number;
  satisfactionRate: number | null;
  satisfactionResponses: number;
};

export type Indicateurs = {
  year: number | null;
  learnersTrained: number;
  satisfactionRate: number | null;
  satisfactionResponses: number;
  responseRate: number | null;
  formationsDelivered: number;
  computedAt: string;
  byFormation: FormationIndicator[];
};

const SATISFACTION_KINDS = ['satisfaction_chaud', 'satisfaction_froid'];
const DONE_STATUSES = ['completed', 'closed', 'archived'];

type DossierRow = {
  id: string;
  formation_id: string | null;
  learner_id: string | null;
  status: string;
  end_date: string | null;
};

type ResponseRow = {
  dossier_id: string;
  score: number | null;
  template: { kind: string } | null;
};

type AssignmentRow = {
  status: string;
  template: { kind: string } | null;
};

const average = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

/** `year = null` → toutes périodes confondues. */
export async function loadIndicateurs(sb: SupabaseClient, year: number | null): Promise<Indicateurs> {
  const [{ data: dossierRows }, { data: responseRows }, { data: assignmentRows }, { data: formationRows }] =
    await Promise.all([
      sb
        .schema('app')
        .from('dossiers')
        .select('id, formation_id, learner_id, status, end_date')
        .is('deleted_at', null)
        .in('status', DONE_STATUSES),
      sb
        .schema('app')
        .from('questionnaire_responses')
        .select('dossier_id, score, template:questionnaire_templates(kind)'),
      sb
        .schema('app')
        .from('questionnaire_assignments')
        .select('status, template:questionnaire_templates(kind)'),
      sb.schema('app').from('formations').select('id, title').is('deleted_at', null),
    ]);

  const inPeriod = (endDate: string | null): boolean =>
    year === null || (endDate ?? '').startsWith(String(year));

  const dossiers = ((dossierRows ?? []) as unknown as DossierRow[]).filter((d) => inPeriod(d.end_date));
  const dossierIds = new Set(dossiers.map((d) => d.id));
  const titles = new Map(
    ((formationRows ?? []) as unknown as Array<{ id: string; title: string }>).map((f) => [f.id, f.title]),
  );

  const satisfactionByDossier = new Map<string, number[]>();
  for (const r of (responseRows ?? []) as unknown as ResponseRow[]) {
    if (!SATISFACTION_KINDS.includes(r.template?.kind ?? '')) continue;
    if (typeof r.score !== 'number') continue;
    if (!dossierIds.has(r.dossier_id)) continue;
    const bucket = satisfactionByDossier.get(r.dossier_id) ?? [];
    bucket.push(r.score);
    satisfactionByDossier.set(r.dossier_id, bucket);
  }

  const perFormation = new Map<string, { learners: Set<string>; scores: number[] }>();
  const allLearners = new Set<string>();
  const allScores: number[] = [];

  for (const d of dossiers) {
    if (d.learner_id) allLearners.add(d.learner_id);
    const scores = satisfactionByDossier.get(d.id) ?? [];
    allScores.push(...scores);

    if (!d.formation_id) continue;
    const bucket = perFormation.get(d.formation_id) ?? { learners: new Set<string>(), scores: [] };
    if (d.learner_id) bucket.learners.add(d.learner_id);
    bucket.scores.push(...scores);
    perFormation.set(d.formation_id, bucket);
  }

  // Taux de retour : questionnaires de satisfaction renseignés / envoyés.
  const satisfactionAssignments = ((assignmentRows ?? []) as unknown as AssignmentRow[]).filter((a) =>
    SATISFACTION_KINDS.includes(a.template?.kind ?? ''),
  );
  const completed = satisfactionAssignments.filter((a) => a.status === 'completed').length;
  const responseRate =
    satisfactionAssignments.length > 0
      ? Math.round((completed / satisfactionAssignments.length) * 100)
      : null;

  const byFormation: FormationIndicator[] = [...perFormation.entries()]
    .map(([formationId, b]) => ({
      formationId,
      title: titles.get(formationId) ?? 'Formation supprimée',
      learners: b.learners.size,
      satisfactionRate: average(b.scores),
      satisfactionResponses: b.scores.length,
    }))
    .sort((a, b) => b.learners - a.learners || a.title.localeCompare(b.title, 'fr'));

  return {
    year,
    learnersTrained: allLearners.size,
    satisfactionRate: average(allScores),
    satisfactionResponses: allScores.length,
    responseRate,
    formationsDelivered: byFormation.length,
    computedAt: new Date().toISOString(),
    byFormation,
  };
}
