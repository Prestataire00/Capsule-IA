/**
 * Contact interne de l'organisme (membre de l'équipe). Type et helpers purs —
 * partagés entre le chargement serveur et le formulaire côté client.
 */
export type OrgContact = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
  commercial: 'Commercial',
  formateur: 'Formateur',
  referent: 'Référent',
};

export function contactLabel(c: OrgContact): string {
  return `${c.name} — ${ROLE_LABELS[c.role] ?? c.role}`;
}

/** Ligne prête à coller dans un champ « référent » (nom, e-mail, téléphone). */
export function contactLine(c: OrgContact): string {
  return [c.name, c.email, c.phone].filter(Boolean).join(' · ');
}
