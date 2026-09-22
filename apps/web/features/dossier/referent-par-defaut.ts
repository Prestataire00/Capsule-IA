/**
 * Qui est le référent d'un dossier, par défaut. Module pur.
 *
 * Le référent est la personne du client à qui partent la convention, les devis
 * et les factures (`dossiers.contact_id`, 0167). Il pouvait être désigné à la
 * main sur la fiche, mais rien ne le posait à la création : tout dossier
 * retombait donc sur le contact générique de l'entreprise — le même pour
 * toutes ses affaires, alors que c'est justement ce que la 0167 voulait éviter.
 *
 * Le défaut juste est **celui qui commande la formation**. La demande recueille
 * déjà son nom, son e-mail et son téléphone ; il suffisait de s'en servir.
 *
 * Deux précautions portent ce module : ne pas créer un contact de plus à chaque
 * dossier pour la même personne, et ne jamais écraser un référent déjà choisi.
 */

export type NomDecoupe = { firstName: string; lastName: string };

/**
 * Découpe un nom saisi en un seul champ. `contacts` exige un prénom et un nom,
 * la demande ne recueille qu'une ligne : le dernier mot fait le nom de famille,
 * le reste le prénom. « Marie-Claire Dupont du Pré » garde son nom composé.
 */
export function decouperNom(nomComplet: string | null | undefined): NomDecoupe | null {
  const propre = (nomComplet ?? '').trim().replace(/\s+/g, ' ');
  if (propre === '') return null;
  const mots = propre.split(' ');
  if (mots.length === 1) return { firstName: '', lastName: mots[0]! };
  return { firstName: mots[0]!, lastName: mots.slice(1).join(' ') };
}

export type ContactConnu = {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly isPrimary?: boolean;
};

const normalise = (v: string | null | undefined): string =>
  (v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Ce contact est-il déjà celui qu'on s'apprête à créer ?
 *
 * L'e-mail tranche quand les deux en ont un — deux homonymes chez le même
 * client restent deux personnes. Sans e-mail, on se rabat sur le nom : c'est
 * imparfait, mais créer un doublon à chaque dossier l'est davantage.
 */
export function memeContact(
  contact: ContactConnu,
  cherche: { nom: NomDecoupe; email: string | null },
): boolean {
  const emailContact = normalise(contact.email);
  const emailCherche = normalise(cherche.email);
  if (emailContact !== '' && emailCherche !== '') return emailContact === emailCherche;

  const nomContact = normalise([contact.firstName, contact.lastName].filter(Boolean).join(' '));
  const nomCherche = normalise([cherche.nom.firstName, cherche.nom.lastName].filter(Boolean).join(' '));
  return nomContact !== '' && nomContact === nomCherche;
}

export type ChoixReferent =
  /** Un contact existant fait l'affaire : on le désigne, sans rien créer. */
  | { action: 'designer'; contactId: string }
  /** Personne ne correspond : créer ce contact chez le client, puis le désigner. */
  | { action: 'creer'; nom: NomDecoupe; email: string | null; phone: string | null }
  /** Rien d'exploitable : le dossier retombe sur le contact de l'entreprise. */
  | { action: 'aucun' };

/**
 * Le référent à poser sur un dossier qu'on crée.
 *
 * `dejaDesigne` court-circuite tout : un référent choisi à la main ne se fait
 * pas remplacer par un défaut, même meilleur.
 */
export function referentParDefaut(input: {
  dejaDesigne?: string | null;
  /** Le commanditaire, tel que la demande l'a recueilli. */
  commanditaire?: { nom: string | null; email: string | null; phone: string | null } | null;
  /** Contacts déjà connus chez l'entreprise cliente. */
  contacts?: readonly ContactConnu[];
}): ChoixReferent {
  if (input.dejaDesigne) return { action: 'designer', contactId: input.dejaDesigne };

  const contacts = input.contacts ?? [];
  const nom = decouperNom(input.commanditaire?.nom);
  const email = input.commanditaire?.email?.trim() || null;

  if (nom) {
    const connu = contacts.find((c) => memeContact(c, { nom, email }));
    if (connu) return { action: 'designer', contactId: connu.id };
    return { action: 'creer', nom, email, phone: input.commanditaire?.phone?.trim() || null };
  }

  // Aucun commanditaire nommé : le contact principal du client fait un défaut
  // raisonnable — c'est lui qui reçoit déjà le courrier de l'entreprise.
  const principal = contacts.find((c) => c.isPrimary) ?? contacts[0];
  return principal ? { action: 'designer', contactId: principal.id } : { action: 'aucun' };
}
