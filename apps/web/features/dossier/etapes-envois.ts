// ARCHETYPE: shared
// Étape de l'avancement « Questionnaires envoyés ». Module pur.
//
// Demande d'Ismael le 27/09/2026 : la vue d'ensemble d'un dossier doit dire si
// les questionnaires sont partis. Cela se constate dans les données, comme les
// autres étapes — rien à cocher, sauf à la valider à la main quand l'envoi
// s'est fait hors de l'application.

export type EtapeConstatee = { done: boolean; at: string | null; hint: string };

const plusTot = (dates: ReadonlyArray<string | null | undefined>): string | null =>
  dates.filter((d): d is string => Boolean(d)).sort()[0] ?? null;

/**
 * Questionnaires envoyés : au moins un questionnaire parti vers le stagiaire,
 * l'entreprise, le formateur ou le financeur. Le positionnement n'en fait pas
 * partie — il a son étape, « Analyse du besoin reçue ».
 */
export function etapeQuestionnaires(
  envois: ReadonlyArray<{ status: string; created_at: string; kind: string | null }>,
  programmes: number,
): EtapeConstatee {
  const partis = envois.filter((e) => e.kind !== 'positionnement' && e.status !== 'expired');
  if (partis.length > 0) {
    const repondus = partis.filter((e) => e.status === 'completed').length;
    return {
      done: true,
      at: plusTot(partis.map((e) => e.created_at)),
      hint: `${partis.length} envoyé${partis.length > 1 ? 's' : ''}, ${repondus} répondu${repondus > 1 ? 's' : ''}.`,
    };
  }
  return {
    done: false,
    at: null,
    hint:
      programmes > 0
        ? `${programmes} questionnaire${programmes > 1 ? 's' : ''} coché${programmes > 1 ? 's' : ''} sur la séance : ${programmes > 1 ? 'ils partiront' : 'il partira'} le jour prévu.`
        : 'Aucun questionnaire envoyé — cochez-les dans l’onglet Questionnaires de la séance.',
  };
}
