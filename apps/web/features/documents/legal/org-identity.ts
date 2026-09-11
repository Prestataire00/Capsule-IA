// Bloc d'identité de l'organisme, identique sur TOUS les documents (PDF comme
// HTML) : c'est ce qui permet à un financeur ou à un contrôle de rattacher
// n'importe quelle pièce à l'organisme émetteur.
// Pur : aucun import next/supabase/react.

export type OrgIdentity = {
  /** Raison sociale, à défaut nom commercial. */
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  siret: string | null;
  /** Numéro de déclaration d'activité auprès de la DREETS. */
  nda: string | null;
  /** Agréments et habilitations (CNAPS, etc.). */
  certifications: string | null;
};

/**
 * Les lignes du bloc d'identité, dans l'ordre :
 *   1. Raison sociale
 *   2. Adresse complète
 *   3. Téléphone | e-mail
 *   4. SIRET · Déclaration d'activité · agréments
 * Les lignes sans donnée disparaissent (jamais de « SIRET : — »).
 */
export function orgIdentityLines(org: OrgIdentity): string[] {
  const contact = [org.phone, org.email].map((v) => v?.trim()).filter(Boolean).join(' | ');
  const legal = [
    org.siret?.trim() ? `SIRET : ${org.siret.trim()}` : null,
    org.nda?.trim() ? `Déclaration d'activité : ${org.nda.trim()}` : null,
    org.certifications?.trim() || null,
  ]
    .filter(Boolean)
    .join(' - ');

  return [org.name?.trim() || '', org.address?.trim() || '', contact, legal].filter((l) => l.length > 0);
}

/** Identité sur une seule ligne (pieds de page compacts). */
export function orgIdentityOneLine(org: OrgIdentity): string {
  return orgIdentityLines(org).join(' · ');
}
