// Le contenu d'une convocation de groupe, sans accès aux données : la même
// liste doit sortir dans le PDF et dans l'e-mail qui l'accompagne.

export type ParticipantConvoque = {
  readonly id: string;
  readonly prenom: string;
  readonly nom: string;
  readonly email: string | null;
  readonly companyId: string | null;
};

const ADRESSE_FACTICE = /\.invalid$/i;

/** Nom de famille d'abord, comme sur une feuille d'émargement. */
export function trierParticipants(liste: readonly ParticipantConvoque[]): ParticipantConvoque[] {
  return [...liste].sort(
    (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' }),
  );
}

/**
 * « 1. ZOLA Léa : convoqué(e) par e-mail » — une ligne « Libellé : valeur » du
 * PDF à la charte. Le document est déposé dans l'espace entreprise, que les
 * stagiaires du dossier voient aussi : il nomme les participants, sans
 * publier leurs adresses.
 */
export function lignesParticipants(liste: readonly ParticipantConvoque[]): string[] {
  return trierParticipants(liste).map((p, i) => {
    const joignable = Boolean(p.email && !ADRESSE_FACTICE.test(p.email.trim()));
    return `${i + 1}. ${p.nom.toUpperCase()} ${p.prenom} : ${joignable ? 'convoqué(e) par e-mail' : 'à prévenir par l’entreprise'}`;
  });
}

/** « convocation-groupe-a-2026-10-08.pdf ». */
export function nomFichierConvocation(groupe: string | null, debutIso: string, jourParis: string): string {
  const base = (groupe ?? 'seance')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `convocation-${base || 'seance'}-${jourParis || debutIso.slice(0, 10)}.pdf`;
}
