/**
 * Lecture d'une liste de stagiaires collée à la main.
 *
 * La liste nominative arrive presque toujours en pièce jointe — un tableau, un
 * mail, une capture recopiée — et jamais deux fois sous la même forme. Plutôt
 * que d'imposer un gabarit, on accepte les séparateurs usuels et on repère
 * l'adresse où qu'elle soit sur la ligne.
 *
 * Module pur : aucune ligne n'est créée ici, elles sont seulement comprises —
 * et l'écran les montre avant d'écrire quoi que ce soit.
 */

export type LigneApprenant = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
};

export type LigneRejetee = { readonly ligne: string; readonly motif: string };

export type LectureListe = {
  readonly apprenants: LigneApprenant[];
  readonly rejets: LigneRejetee[];
};

const EMAIL = /[^\s,;<>()]+@[^\s,;<>()]+\.[a-z]{2,}/i;
// Numéro français ou international, avec espaces, points ou tirets.
const TELEPHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,13}\d/;

const NETTOIE = /[<>()"']/g;

/** Découpe sur le séparateur qui structure vraiment la ligne. */
function champs(ligne: string): string[] {
  for (const sep of ['\t', ';', ',']) {
    if (ligne.includes(sep)) return ligne.split(sep).map((c) => c.trim());
  }
  return ligne.split(/\s+/).map((c) => c.trim());
}

/**
 * Un nom de famille s'écrit souvent en capitales dans les listes RH : quand
 * c'est le cas, il fait autorité sur l'ordre des mots — « DAHAN Nathaniel »
 * comme « Nathaniel DAHAN » désignent la même personne.
 */
function separeNom(mots: string[]): { firstName: string; lastName: string } {
  const propres = mots.filter((m) => m.length > 0);
  if (propres.length === 0) return { firstName: '', lastName: '' };
  if (propres.length === 1) return { firstName: '', lastName: propres[0]! };

  const capitales = propres.filter((m) => m.length > 1 && m === m.toLocaleUpperCase('fr-FR') && /\p{L}/u.test(m));
  if (capitales.length > 0 && capitales.length < propres.length) {
    const nom = capitales.join(' ');
    const prenom = propres.filter((m) => !capitales.includes(m)).join(' ');
    return { firstName: prenom, lastName: nom };
  }
  return { firstName: propres[0]!, lastName: propres.slice(1).join(' ') };
}

export function parseListeApprenants(texte: string): LectureListe {
  const apprenants: LigneApprenant[] = [];
  const rejets: LigneRejetee[] = [];
  const vues = new Set<string>();

  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne.length === 0) continue;

    const email = ligne.match(EMAIL)?.[0]?.replace(NETTOIE, '').toLowerCase() ?? null;
    const sansEmail = email ? ligne.replace(new RegExp(email, 'i'), ' ') : ligne;

    const telBrut = sansEmail.match(TELEPHONE)?.[0] ?? null;
    // Un matricule ou une date ne sont pas des téléphones : au moins 9 chiffres.
    const phone = telBrut && telBrut.replace(/\D/g, '').length >= 9 ? telBrut.trim() : null;
    const sansTel = phone ? sansEmail.replace(phone, ' ') : sansEmail;

    const mots = champs(sansTel)
      .flatMap((c) => c.split(/\s+/))
      .map((m) => m.replace(NETTOIE, '').trim())
      .filter((m) => m.length > 0 && /\p{L}/u.test(m));

    const { firstName, lastName } = separeNom(mots);
    if (!lastName) {
      rejets.push({ ligne, motif: 'Aucun nom lisible sur cette ligne.' });
      continue;
    }

    // Deux fois la même personne dans un copier-coller : on n'inscrit qu'une fois.
    const cle = (email ?? `${firstName}|${lastName}`).toLocaleLowerCase('fr-FR');
    if (vues.has(cle)) {
      rejets.push({ ligne, motif: 'Déjà présent plus haut dans la liste.' });
      continue;
    }
    vues.add(cle);

    apprenants.push({ firstName, lastName, email, phone });
  }

  return { apprenants, rejets };
}
