import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { Indicateurs } from './load-indicateurs';

/**
 * Indicateurs saisis à la main (table `app.declared_indicators`, migration 0135).
 *
 * Le calcul automatique ne couvre que ce qui s'est passé dans Capsule. Un
 * organisme arrive avec un historique — années précédentes, outil précédent —
 * et l'indicateur Qualiopi 2 exige des résultats publiés. Les déclarations
 * **s'ajoutent** au calcul : elles ne l'écrasent pas, pour qu'un chiffre réel ne
 * puisse jamais être masqué par une saisie.
 */
export type DeclaredIndicator = {
  readonly id: string;
  readonly formationId: string | null;
  readonly formationTitle: string | null;
  readonly year: number;
  readonly learnersTrained: number | null;
  readonly satisfactionRate: number | null;
  readonly satisfactionResponses: number | null;
  readonly responseRate: number | null;
  readonly formationsDelivered: number | null;
  readonly source: string;
  readonly note: string | null;
};

type Row = {
  id: string;
  formation_id: string | null;
  formation: { title: string } | { title: string }[] | null;
  year: number;
  learners_trained: number | null;
  satisfaction_rate: number | string | null;
  satisfaction_responses: number | null;
  response_rate: number | string | null;
  formations_delivered: number | null;
  source: string;
  note: string | null;
};

const nombre = (v: number | string | null): number | null =>
  v === null || v === '' ? null : Number(v);

/** Déclarations de l'organisme, éventuellement bornées à une année. */
export async function loadDeclared(
  organizationId: string,
  year: number | null,
): Promise<DeclaredIndicator[]> {
  // `declared_indicators` est absente de `shared/types/database.ts`, non
  // régénéré depuis le 2026-06-26 (audit CAP-06) : les casts disparaîtront à la
  // régénération.
  let requete = supabaseAdmin()
    .schema('app')
    .from('declared_indicators' as never)
    .select(
      'id, formation_id, year, learners_trained, satisfaction_rate, satisfaction_responses, ' +
        'response_rate, formations_delivered, source, note, formation:formations(title)',
    )
    .eq('organization_id' as never, organizationId as never);
  if (year !== null) requete = requete.eq('year' as never, year as never);

  const { data, error } = (await requete) as unknown as { data: Row[] | null; error: { message: string } | null };
  if (error) {
    console.error('[indicateurs] lecture des déclarations échouée', error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    formationId: r.formation_id,
    formationTitle: Array.isArray(r.formation) ? (r.formation[0]?.title ?? null) : (r.formation?.title ?? null),
    year: r.year,
    learnersTrained: r.learners_trained,
    satisfactionRate: nombre(r.satisfaction_rate),
    satisfactionResponses: r.satisfaction_responses,
    responseRate: nombre(r.response_rate),
    formationsDelivered: r.formations_delivered,
    source: r.source,
    note: r.note,
  }));
}

/** Moyenne pondérée par le nombre de réponses ; `null` si aucune réponse. */
function moyennePonderee(
  parts: ReadonlyArray<{ taux: number | null; reponses: number }>,
): number | null {
  const utiles = parts.filter((p) => p.taux !== null && p.reponses > 0);
  const total = utiles.reduce((n, p) => n + p.reponses, 0);
  if (total === 0) return null;
  return Math.round(utiles.reduce((n, p) => n + p.taux! * p.reponses, 0) / total);
}

export type IndicateursFusionnes = Indicateurs & {
  /** Part déclarée à la main, pour l'afficher distinctement du calcul. */
  readonly declared: {
    readonly learnersTrained: number;
    readonly satisfactionResponses: number;
    readonly formationsDelivered: number;
    readonly sources: readonly string[];
  };
};

/**
 * Ajoute les déclarations aux indicateurs calculés.
 *
 * Les effectifs et les réponses s'additionnent ; la satisfaction est moyennée en
 * pondérant par le nombre de réponses de chaque source. Le taux de retour
 * déclaré, lui, remplace le taux calculé quand il est renseigné : additionner
 * deux pourcentages n'aurait aucun sens.
 */
export function fusionner(calcul: Indicateurs, declarations: readonly DeclaredIndicator[]): IndicateursFusionnes {
  const globales = declarations.filter((d) => d.formationId === null);
  const parFormation = declarations.filter((d) => d.formationId !== null);

  const sommeDeclaree = (
    lignes: readonly DeclaredIndicator[],
    champ: 'learnersTrained' | 'satisfactionResponses' | 'formationsDelivered',
  ): number => lignes.reduce((n, d) => n + (d[champ] ?? 0), 0);

  // Les lignes par formation nourrissent aussi les totaux : déclarer formation
  // par formation doit suffire, sans ressaisir un global.
  const toutes = [...globales, ...parFormation];

  const learnersDeclares = sommeDeclaree(toutes, 'learnersTrained');
  const reponsesDeclarees = sommeDeclaree(toutes, 'satisfactionResponses');

  const satisfaction = moyennePonderee([
    { taux: calcul.satisfactionRate, reponses: calcul.satisfactionResponses },
    ...toutes.map((d) => ({ taux: d.satisfactionRate, reponses: d.satisfactionResponses ?? 0 })),
  ]);

  const tauxRetourDeclare = globales.find((d) => d.responseRate !== null)?.responseRate ?? null;

  const declareesParFormation = new Map<string, DeclaredIndicator[]>();
  for (const d of parFormation) {
    const cle = d.formationId!;
    declareesParFormation.set(cle, [...(declareesParFormation.get(cle) ?? []), d]);
  }

  const byFormation = calcul.byFormation.map((f) => {
    const lignes = declareesParFormation.get(f.formationId) ?? [];
    if (lignes.length === 0) return f;
    declareesParFormation.delete(f.formationId);
    return {
      ...f,
      learners: f.learners + sommeDeclaree(lignes, 'learnersTrained'),
      satisfactionResponses: f.satisfactionResponses + sommeDeclaree(lignes, 'satisfactionResponses'),
      satisfactionRate: moyennePonderee([
        { taux: f.satisfactionRate, reponses: f.satisfactionResponses },
        ...lignes.map((d) => ({ taux: d.satisfactionRate, reponses: d.satisfactionResponses ?? 0 })),
      ]),
    };
  });

  // Formations qui n'ont que des chiffres déclarés : elles doivent apparaître.
  for (const [formationId, lignes] of declareesParFormation) {
    byFormation.push({
      formationId,
      title: lignes[0]?.formationTitle ?? 'Formation',
      learners: sommeDeclaree(lignes, 'learnersTrained'),
      satisfactionRate: moyennePonderee(
        lignes.map((d) => ({ taux: d.satisfactionRate, reponses: d.satisfactionResponses ?? 0 })),
      ),
      satisfactionResponses: sommeDeclaree(lignes, 'satisfactionResponses'),
    });
  }

  const formationsAvecChiffres = byFormation.filter((f) => f.learners > 0 || f.satisfactionResponses > 0).length;

  return {
    ...calcul,
    learnersTrained: calcul.learnersTrained + learnersDeclares,
    satisfactionRate: satisfaction,
    satisfactionResponses: calcul.satisfactionResponses + reponsesDeclarees,
    responseRate: tauxRetourDeclare ?? calcul.responseRate,
    formationsDelivered: Math.max(
      calcul.formationsDelivered + sommeDeclaree(globales, 'formationsDelivered'),
      formationsAvecChiffres,
    ),
    byFormation: byFormation.sort(
      (a, b) => b.learners - a.learners || a.title.localeCompare(b.title, 'fr'),
    ),
    declared: {
      learnersTrained: learnersDeclares,
      satisfactionResponses: reponsesDeclarees,
      formationsDelivered: sommeDeclaree(globales, 'formationsDelivered'),
      sources: [...new Set(toutes.map((d) => d.source))],
    },
  };
}
