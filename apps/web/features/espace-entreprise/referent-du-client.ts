// Le référent d'un dossier d'entreprise, quand personne ne l'a désigné : le
// contact référent du client. Module pur.

export type ContactClient = {
  readonly id: string;
  readonly prenom: string | null;
  readonly nom: string | null;
  readonly email: string | null;
  readonly principal: boolean;
};

export type ResponsableEntreprise = { readonly nom: string | null; readonly email: string | null };

const propre = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

/**
 * Le contact à retenir : celui qui porte l'adresse du responsable de la fiche
 * entreprise, sinon le contact principal, sinon l'unique contact. `null` : il
 * faudra créer la fiche du responsable, ou le désigner à la main.
 */
export function contactReferent(contacts: readonly ContactClient[], responsable: ResponsableEntreprise): ContactClient | null {
  const email = propre(responsable.email);
  if (email) {
    const lui = contacts.find((c) => propre(c.email) === email);
    if (lui) return lui;
  }
  const principal = contacts.find((c) => c.principal);
  if (principal) return principal;
  return contacts.length === 1 ? contacts[0]! : null;
}

/** « Rita Dupont » → prénom « Rita », nom « Dupont » ; un seul mot devient le nom. */
export function decouperNom(complet: string | null): { prenom: string | null; nom: string | null } {
  const mots = (complet ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { prenom: null, nom: null };
  if (mots.length === 1) return { prenom: null, nom: mots[0]! };
  return { prenom: mots[0]!, nom: mots.slice(1).join(' ') };
}
