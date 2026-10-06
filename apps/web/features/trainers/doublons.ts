/**
 * Les fiches (formateurs, apprenants) qui désignent probablement la même
 * personne (audit du point Capsule IA, 06/10/2026) : même nom (accents, casse
 * et ordre prénom/nom ignorés), même e-mail, même téléphone ou même SIRET. Pur.
 */

export type FicheFormateur = {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly siret: string | null;
  readonly aUnCompte: boolean;
  readonly creeLe: string;
};

export type GroupeDoublons = { readonly raison: string; readonly fiches: readonly FicheFormateur[] };

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ' ').trim();

export const cleDeNom = (f: Pick<FicheFormateur, 'firstName' | 'lastName'>): string | null => {
  const mots = sansAccent(`${f.firstName ?? ''} ${f.lastName ?? ''}`).split(/\s+/).filter(Boolean).sort();
  return mots.length >= 2 ? mots.join(' ') : null;
};

// Une adresse factice (import sans e-mail) ne rapproche personne.
const cleDEmail = (e: string | null) => {
  const t = (e ?? '').trim().toLowerCase();
  return t.includes('@') && !t.endsWith('.invalid') ? t : null;
};

const chiffres = (t: string | null) => (t ?? '').replace(/\D/g, '');
const cleDeTelephone = (t: string | null) => {
  const c = chiffres(t);
  if (c.length < 9) return null;
  return c.slice(-9); // 06 12 34 56 78 et +33 6 12 34 56 78 se rejoignent
};

export function doublonsDeFormateurs(fiches: readonly FicheFormateur[]): GroupeDoublons[] {
  const groupes = new Map<string, { raison: string; fiches: FicheFormateur[] }>();
  const ajouter = (cle: string | null, raison: string, f: FicheFormateur) => {
    if (!cle) return;
    const g = groupes.get(`${raison}:${cle}`) ?? { raison, fiches: [] };
    g.fiches.push(f);
    groupes.set(`${raison}:${cle}`, g);
  };
  for (const f of fiches) {
    ajouter(cleDeNom(f), 'Même nom', f);
    ajouter(cleDEmail(f.email), 'Même e-mail', f);
    ajouter(cleDeTelephone(f.phone), 'Même téléphone', f);
    ajouter(chiffres(f.siret).length === 14 ? chiffres(f.siret) : null, 'Même SIRET', f);
  }
  // Un même couple de fiches ne s'affiche qu'une fois, sous sa première raison.
  const vus = new Set<string>();
  const out: GroupeDoublons[] = [];
  for (const g of groupes.values()) {
    if (g.fiches.length < 2) continue;
    const cle = g.fiches.map((f) => f.id).sort().join('|');
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({ raison: g.raison, fiches: [...g.fiches].sort(ordreDeGarde) });
  }
  return out;
}

/** La fiche à garder par défaut : celle qui a un compte, sinon la plus ancienne. */
export const ordreDeGarde = (a: FicheFormateur, b: FicheFormateur): number =>
  Number(b.aUnCompte) - Number(a.aUnCompte) || a.creeLe.localeCompare(b.creeLe);
