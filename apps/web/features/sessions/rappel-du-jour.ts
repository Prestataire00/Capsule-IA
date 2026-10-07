// Un seul rappel « 48 h » par destinataire, par formation et par jour. Module pur.
//
// Une journée découpée en deux séances (matin, après-midi) entrait deux fois
// dans la fenêtre du rappel : le formateur et l'entreprise recevaient deux
// e-mails identiques « commence dans 48 heures » (07/10/2026).

const JOUR_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' });

/** Ce qui rassemble les séances d'un même rappel : la formation, sinon le dossier, sinon la séance. */
export const groupeDeRappel = (s: { id: string; formation_id: string | null; dossier_id: string | null }): string =>
  s.formation_id ?? s.dossier_id ?? s.id;

/** « 2026-10-09|<formation> » : le jour, à Paris, et le groupe. */
export const jourDeRappel = (s: { id: string; starts_at: string; formation_id: string | null; dossier_id: string | null }): string =>
  `${JOUR_PARIS.format(new Date(s.starts_at))}|${groupeDeRappel(s)}`;

/**
 * Les envois à faire, dans l'ordre des séances : un par destinataire et par
 * jour-groupe, en sautant ceux déjà prévenus — par un passage précédent
 * (`dejaPrevenus`, clés `jour|groupe|email`) ou plus tôt dans ce passage.
 */
export function rappelsAEnvoyer<S extends { id: string; starts_at: string; formation_id: string | null; dossier_id: string | null }>(
  seances: ReadonlyArray<{ seance: S; emails: readonly string[] }>,
  dejaPrevenus: ReadonlySet<string>,
): Array<{ seance: S; email: string }> {
  const vus = new Set(dejaPrevenus);
  const out: Array<{ seance: S; email: string }> = [];
  for (const { seance, emails } of [...seances].sort((a, b) => a.seance.starts_at.localeCompare(b.seance.starts_at))) {
    for (const brut of emails) {
      const email = brut.trim().toLowerCase();
      const cle = `${jourDeRappel(seance)}|${email}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      out.push({ seance, email: brut });
    }
  }
  return out;
}
