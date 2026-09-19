/**
 * Qui reçoit une convocation. Module pur : la même règle doit valoir pour
 * l'envoi automatique J-7, l'envoi manuel depuis la séance, et tout envoi à
 * venir — sans quoi un stagiaire serait convoqué par un chemin et pas par
 * l'autre.
 *
 * Règle posée par Ismael : **l'entreprise reçoit toutes les convocations de
 * ses inscrits**, en filet de sécurité. Un salarié change de poste, ne lit pas
 * sa boîte, ou n'a pas d'adresse du tout — l'employeur qui a commandé la
 * formation doit pouvoir transmettre. Un particulier n'a personne derrière
 * lui : lui seul est destinataire.
 */

export type DestinatairesConvocation = {
  /** Adresses à qui l'e-mail part réellement. */
  readonly destinataires: string[];
  /** L'entreprise est en copie de sécurité, sans être la destinataire première. */
  readonly viaEntreprise: boolean;
  /** Rien à envoyer : ni le stagiaire ni son entreprise n'ont d'adresse. */
  readonly injoignable: boolean;
};

const propre = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim().toLowerCase();
  // Une adresse en `.invalid` (RFC 2606) désigne un titulaire provisoire ou une
  // absence d'adresse : elle ne doit jamais recevoir d'envoi.
  if (t.length === 0 || !t.includes('@') || t.endsWith('.invalid')) return null;
  return t;
};

export function destinatairesConvocation(input: {
  learnerEmail?: string | null;
  /** Adresse du référent du dossier, quand il en a un. */
  referentEmail?: string | null;
  /** Adresse de contact de l'entreprise cliente. */
  companyEmail?: string | null;
}): DestinatairesConvocation {
  const stagiaire = propre(input.learnerEmail);
  // Le référent du dossier prime sur le contact générique de l'entreprise :
  // c'est lui qui suit cette formation-là.
  const cote = propre(input.referentEmail) ?? propre(input.companyEmail);

  const destinataires = [...new Set([stagiaire, cote].filter((e): e is string => e !== null))];

  return {
    destinataires,
    viaEntreprise: cote !== null,
    injoignable: destinataires.length === 0,
  };
}

/**
 * Mention ajoutée au corps de l'e-mail quand l'entreprise est destinataire :
 * elle doit comprendre pourquoi elle reçoit la convocation d'un tiers, et ce
 * qu'on attend d'elle quand le stagiaire n'a pas d'adresse.
 */
export function mentionEntreprise(nomStagiaire: string, stagiaireInjoignable: boolean): string {
  return stagiaireInjoignable
    ? `Cette convocation concerne ${nomStagiaire}, qui n'a pas d'adresse e-mail renseignée : merci de la lui transmettre.`
    : `Vous recevez cette convocation en copie, en tant qu'employeur de ${nomStagiaire}.`;
}
