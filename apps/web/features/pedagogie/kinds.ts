/**
 * Les formes d'exercice (0172). Module pur : le formateur, l'apprenant et la
 * file de validation doivent nommer et juger la même chose.
 */

export const FORMES = ['quiz', 'texte_a_trou', 'cartes_memoire', 'video', 'devoir'] as const;
export type Forme = (typeof FORMES)[number];

export const FORME_LABELS: Record<Forme, string> = {
  quiz: 'Quiz',
  texte_a_trou: 'Texte à trou',
  cartes_memoire: 'Cartes mémoire',
  video: 'Vidéo',
  devoir: 'Exercice à rendre',
};

export const FORME_DESCRIPTIONS: Record<Forme, string> = {
  quiz: 'Questions à choix, corrigées automatiquement.',
  texte_a_trou: 'Un texte dont les mots clés sont masqués, corrigé automatiquement.',
  cartes_memoire: 'Recto / verso à réviser. Rien à corriger : le stagiaire s’entraîne.',
  video: 'Une vidéo à regarder, avec une consigne. Suivi de visionnage déclaratif.',
  devoir: 'Rendu libre en texte ou en fichier, que vous notez à la main.',
};

/** Ces formes se corrigent seules : le stagiaire a sa note en fin d'exercice. */
export const FORMES_AUTO_CORRIGEES: readonly Forme[] = ['quiz', 'texte_a_trou'];

export function estForme(v: unknown): v is Forme {
  return typeof v === 'string' && (FORMES as readonly string[]).includes(v);
}

export type Carte = { readonly recto: string; readonly verso: string };

export type ContenuExercice = {
  /** Texte à trou : les réponses sont entre crochets. */
  readonly texte?: string;
  readonly cartes?: readonly Carte[];
  readonly url?: string;
  readonly description?: string;
};

export type ProblemeContenu = { readonly champ: string; readonly motif: string };

const URL_VIDEO = /^https?:\/\/\S+$/i;

/**
 * Ce qui empêche de publier, selon la forme. Volontairement dit avant la
 * publication : un texte à trou sans trou ne se découvre pas côté stagiaire.
 */
export function problemesDuContenu(forme: Forme, contenu: ContenuExercice, nombreDeTrous = 0): ProblemeContenu[] {
  const problemes: ProblemeContenu[] = [];

  if (forme === 'texte_a_trou') {
    if (!contenu.texte || contenu.texte.trim().length === 0) {
      problemes.push({ champ: 'texte', motif: 'Le texte est vide.' });
    } else if (nombreDeTrous === 0) {
      problemes.push({
        champ: 'texte',
        motif: 'Aucun trou : entourez de crochets les mots à masquer, par exemple [intelligence].',
      });
    }
  }

  if (forme === 'cartes_memoire') {
    const cartes = contenu.cartes ?? [];
    if (cartes.length === 0) {
      problemes.push({ champ: 'cartes', motif: 'Ajoutez au moins une carte.' });
    }
    cartes.forEach((c, i) => {
      if (c.recto.trim().length === 0 || c.verso.trim().length === 0) {
        problemes.push({ champ: `carte-${i + 1}`, motif: `Carte ${i + 1} : le recto et le verso sont nécessaires.` });
      }
    });
  }

  if (forme === 'video') {
    if (!contenu.url || !URL_VIDEO.test(contenu.url.trim())) {
      problemes.push({ champ: 'url', motif: 'Donnez un lien vidéo commençant par https://' });
    }
  }

  return problemes;
}
