import type { CalEvent } from '@/shared/lib/integrations/google-calendar-client';

/**
 * L'agenda montre qui forme chaque séance (demande d'Ismael, 05/10/2026).
 *
 * L'évènement Google d'une séance à distance (son Meet) porte le titre qu'il
 * avait à sa création : si le formateur change ensuite, Google l'ignore. Le
 * nom se lit donc dans la base, à l'affichage. Une séance sans évènement
 * Google (présentiel) apparaît quand même, ajoutée par Capsule IA. Pur.
 */

export type SeanceAgenda = {
  readonly id: string;
  readonly titre: string;
  readonly debut: string;
  readonly fin: string;
  readonly lieu: string | null;
  readonly formateurs: readonly string[];
  /** L'évènement Google de la séance (son Meet), s'il existe. */
  readonly evenementId: string | null;
};

const COULEUR_SEANCE = { bg: '#ffedd5', fg: '#9a3412' };

export const libelleFormateurs = (noms: readonly string[]): string =>
  noms.length === 0 ? 'Formateur à désigner' : `Formateur : ${noms.join(', ')}`;

export function agendaAvecFormateurs(evenements: readonly CalEvent[], seances: readonly SeanceAgenda[]): CalEvent[] {
  const parEvenement = new Map(seances.filter((s) => s.evenementId).map((s) => [s.evenementId as string, s]));
  const vues = new Set<string>();
  const enrichis = evenements.map((e) => {
    const s = parEvenement.get(e.id);
    if (!s) return e;
    vues.add(s.id);
    return { ...e, title: `${s.titre} · ${libelleFormateurs(s.formateurs)}` };
  });
  const ajoutees: CalEvent[] = seances
    .filter((s) => !vues.has(s.id))
    .map((s) => ({
      id: `seance:${s.id}`,
      title: `${s.titre} · ${libelleFormateurs(s.formateurs)}`,
      start: s.debut,
      end: s.fin,
      allDay: false,
      location: s.lieu,
      htmlLink: `/sessions/${s.id}`,
      hangoutLink: null,
      colorId: null,
      bgColor: COULEUR_SEANCE.bg,
      fgColor: COULEUR_SEANCE.fg,
    }));
  return [...enrichis, ...ajoutees].sort((a, b) => a.start.localeCompare(b.start));
}
