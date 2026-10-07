// Le référent d'un dossier d'entreprise, quand personne ne l'a désigné : le
// contact référent du client. Module pur.

export type ContactClient = {
  readonly id: string;
  readonly prenom: string | null;
  readonly nom: string | null;
  readonly email: string | null;
  readonly principal: boolean;
};

/** Une personne citée comme interlocuteur du client, quelque part dans l'application. */
export type Candidat = {
  readonly nom: string | null;
  readonly email: string | null;
  readonly telephone?: string | null;
  /** D'où elle vient, pour le dire à l'écran. */
  readonly source: 'demande' | 'demandeur' | 'fiche_entreprise' | 'devis';
};

export type Choix = { readonly contact: ContactClient } | { readonly creer: Candidat } | null;

const propre = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

/**
 * Le référent à retenir, par ordre de confiance : le référent déclaré par
 * l'entreprise dans sa demande, le responsable de sa fiche, le destinataire
 * de son dernier devis — une fiche contact existante quand l'adresse
 * correspond, sinon à créer. Sans candidat, le contact principal, ou l'unique
 * contact.
 */
export function choisirReferent(contacts: readonly ContactClient[], candidats: readonly Candidat[]): Choix {
  for (const c of candidats) {
    const email = propre(c.email);
    if (!email) continue;
    const lui = contacts.find((x) => propre(x.email) === email);
    if (lui) return { contact: lui };
  }
  const principal = contacts.find((c) => c.principal);
  if (principal) return { contact: principal };
  if (contacts.length === 1) return { contact: contacts[0]! };
  const aCreer = candidats.find((c) => propre(c.email));
  return aCreer ? { creer: aCreer } : null;
}

/** « Rita Dupont » → prénom « Rita », nom « Dupont » ; un seul mot devient le nom. */
export function decouperNom(complet: string | null): { prenom: string | null; nom: string | null } {
  const mots = (complet ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { prenom: null, nom: null };
  if (mots.length === 1) return { prenom: null, nom: mots[0]! };
  return { prenom: mots[0]!, nom: mots.slice(1).join(' ') };
}

/**
 * Les interlocuteurs d'une demande, dans l'ordre de la conversion : quand la
 * personne de la demande suit elle-même la formation, le référent qu'elle a
 * déclaré d'abord ; sinon c'est elle qui commande, donc elle d'abord.
 */
export function candidatsDeLaDemande(p: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  referent_name: string | null;
  referent_email: string | null;
  referent_phone: string | null;
  candidate_is_learner: boolean | null;
}): Candidat[] {
  const referent: Candidat = { nom: p.referent_name, email: p.referent_email, telephone: p.referent_phone, source: 'demande' };
  const demandeur: Candidat = {
    nom: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    email: p.email,
    telephone: p.phone,
    source: 'demandeur',
  };
  const ordre = p.candidate_is_learner ? [referent, demandeur] : [demandeur, referent];
  return ordre.filter((c) => (c.email ?? '').trim() !== '');
}

export const LIBELLE_SOURCE: Record<Candidat['source'] | 'contact', string> = {
  demande: 'référent déclaré dans la demande d’inscription',
  demandeur: 'auteur de la demande d’inscription',
  fiche_entreprise: 'responsable de la fiche entreprise',
  devis: 'destinataire du dernier devis',
  contact: 'contact de la fiche entreprise',
};
