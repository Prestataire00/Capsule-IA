import { describe, it, expect } from 'vitest';
import { parseTexteATrou, corrigerTexteATrou, memeReponse } from '../cloze';
import { problemesDuContenu, estForme } from '../kinds';

describe('lecture d’un texte à trou', () => {
  it('masque ce qui est entre crochets, garde le reste', () => {
    const { segments, reponses } = parseTexteATrou("L'[intelligence] artificielle transforme le [travail].");
    expect(reponses).toEqual(['intelligence', 'travail']);
    expect(segments.filter((s) => s.type === 'trou')).toHaveLength(2);
    expect(segments.map((s) => (s.type === 'texte' ? s.valeur : '__')).join('')).toBe(
      "L'__ artificielle transforme le __.",
    );
  });

  it('numérote les trous dans l’ordre de lecture', () => {
    const { segments } = parseTexteATrou('[un] puis [deux]');
    const trous = segments.filter((s): s is { type: 'trou'; index: number; reponse: string } => s.type === 'trou');
    expect(trous.map((t) => t.index)).toEqual([0, 1]);
    expect(trous.map((t) => t.reponse)).toEqual(['un', 'deux']);
  });

  it('ignore des crochets vides plutôt que de créer un trou sans réponse', () => {
    const { reponses } = parseTexteATrou('Un [] deux [trois]');
    expect(reponses).toEqual(['trois']);
  });

  it('accepte un texte sans aucun trou', () => {
    const { reponses, segments } = parseTexteATrou('Rien à masquer ici.');
    expect(reponses).toEqual([]);
    expect(segments).toHaveLength(1);
  });

  it('retire les espaces autour de la réponse attendue', () => {
    expect(parseTexteATrou('Le [ mot  ] clé').reponses).toEqual(['mot']);
  });
});

describe('correction d’un texte à trou', () => {
  it('compte un point par trou juste', () => {
    const c = corrigerTexteATrou(['chat', 'chien'], ['chat', 'chien']);
    expect(c.note).toBe(2);
    expect(c.bareme).toBe(2);
    expect(c.pourcentage).toBe(100);
  });

  it('ne sanctionne ni la casse, ni les accents, ni les espaces en trop', () => {
    expect(memeReponse('élève', 'ELEVE')).toBe(true);
    expect(memeReponse('intelligence artificielle', '  Intelligence   Artificielle ')).toBe(true);
  });

  it('refuse une réponse vide', () => {
    expect(memeReponse('chat', '')).toBe(false);
    expect(corrigerTexteATrou(['chat'], ['']).note).toBe(0);
  });

  it('traite un trou non rempli comme faux, sans planter', () => {
    const c = corrigerTexteATrou(['chat', 'chien'], ['chat']);
    expect(c.note).toBe(1);
    expect(c.parTrou[1]).toMatchObject({ juste: false, donnee: '' });
  });

  it('ne divise jamais par zéro sur un texte sans trou', () => {
    expect(corrigerTexteATrou([], []).pourcentage).toBe(0);
  });
});

describe('ce qui empêche de publier, selon la forme', () => {
  it('refuse un texte à trou sans trou, en disant comment en faire un', () => {
    const p = problemesDuContenu('texte_a_trou', { texte: 'Aucun mot masqué.' }, 0);
    expect(p).toHaveLength(1);
    expect(p[0]?.motif).toMatch(/crochets/i);
  });

  it('accepte un texte à trou qui en contient au moins un', () => {
    expect(problemesDuContenu('texte_a_trou', { texte: 'Un [mot].' }, 1)).toEqual([]);
  });

  it('refuse des cartes vides, et signale laquelle', () => {
    const p = problemesDuContenu('cartes_memoire', { cartes: [{ recto: 'Question', verso: '  ' }] });
    expect(p[0]?.motif).toMatch(/Carte 1/);
  });

  it('exige un lien pour une vidéo', () => {
    expect(problemesDuContenu('video', { url: 'pas-une-url' })[0]?.motif).toMatch(/https/);
    expect(problemesDuContenu('video', { url: 'https://vimeo.com/123' })).toEqual([]);
  });

  it('n’impose rien de particulier à un devoir', () => {
    expect(problemesDuContenu('devoir', {})).toEqual([]);
  });

  it('rejette une forme inconnue venue de la base', () => {
    expect(estForme('quiz')).toBe(true);
    expect(estForme('podcast')).toBe(false);
  });
});
