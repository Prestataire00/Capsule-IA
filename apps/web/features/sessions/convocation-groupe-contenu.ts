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

/** Ce que la convocation d'un groupe dit de chacune de ses séances. */
export type SeanceConvoquee = {
  readonly id: string;
  readonly debut: string;
  readonly fin: string;
  readonly modalite: string;
  readonly lieu: string | null;
  readonly visio: string | null;
  readonly formateur: string | null;
};

const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };
const jourLong = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full' }).format(new Date(iso));
const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * La convocation d'un groupe, toutes ses dates en un document (demande
 * d'Ismael, 15/10/2026, pour Activ Métiers) : les participants une fois en
 * tête, puis chaque séance. Une séance qui n'attend pas tout le groupe nomme
 * les siens.
 */
export function lignesConvocationDuGroupe(input: {
  formation: string;
  client: string | null;
  groupe: string | null;
  seances: readonly SeanceConvoquee[];
  participants: ReadonlyMap<string, readonly ParticipantConvoque[]>;
}): string[] {
  const tous = new Map<string, ParticipantConvoque>();
  for (const s of input.seances) for (const p of input.participants.get(s.id) ?? []) tous.set(p.id, p);
  const seances = [...input.seances].sort((a, b) => a.debut.localeCompare(b.debut));
  return [
    '### Formation',
    '',
    `Intitulé : ${input.formation}`,
    input.client ? `Client : ${input.client}` : null,
    input.groupe ? `Groupe : ${input.groupe}` : null,
    `Séances : ${seances.length}`,
    '',
    `### Participants convoqués (${tous.size})`,
    '',
    ...(tous.size ? lignesParticipants([...tous.values()]) : ['Aucun participant inscrit pour le moment.']),
    '',
    ...seances.flatMap((s) => {
      const siens = input.participants.get(s.id) ?? [];
      const partiel = siens.length > 0 && siens.length < tous.size;
      return [
        `### ${majuscule(jourLong(s.debut))}`,
        '',
        `Horaires : ${heure(s.debut)} - ${heure(s.fin)}`,
        `Modalité : ${MODALITE[s.modalite] ?? s.modalite}`,
        s.lieu ? `Lieu : ${s.lieu}` : null,
        s.visio && s.modalite !== 'presentiel' ? `Lien de connexion : ${s.visio}` : null,
        s.formateur ? `Formateur : ${s.formateur}` : null,
        partiel ? `Participants : ${trierParticipants(siens).map((p) => `${p.prenom} ${p.nom}`.trim()).join(', ')}` : null,
        '',
      ];
    }),
    '### Informations pratiques',
    '',
    "Merci de vous présenter 10 minutes avant le début de chaque séance. La présence est attestée par l'émargement de chaque demi-journée.",
    '',
    "En cas d'empêchement, prévenez l'organisme au plus tôt afin de replanifier.",
  ].filter((l): l is string => l !== null);
}

/** « convocation-groupe-a-acme.pdf ». */
export function nomFichierConvocationDuGroupe(groupe: string | null, client: string | null): string {
  const slug = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `convocation-${[groupe, client].filter((v): v is string => Boolean(v)).map(slug).filter(Boolean).join('-') || 'formation'}.pdf`;
}
