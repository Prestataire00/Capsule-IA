// La case de points d'une question n'avait pas de nom à l'écran : un « 0 » ou
// un « 1 » nu, sans rien qui dise ce qu'il compte (signalé le 2026-09-16).
// Pire, elle ne pouvait pas rester vide le temps d'y retaper un nombre —
// `Number('') || 0` la ramenait à 0, et une question à 0 point ne compte plus
// rien dans la note. `problemesDuQuiz` refusait bien l'enregistrement, mais
// seulement au moment d'enregistrer, sans désigner la case fautive.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { problemesDuQuiz } from '@/features/pedagogie/quiz';

const UI = fs.readFileSync(
  path.resolve(__dirname, '../app/(formateur)/_cours/creer-travail.client.tsx'),
  'utf-8',
);

describe('points d’une question de quiz', () => {
  it('la case porte enfin un nom visible', () => {
    expect(UI).toContain('>pts<');
  });

  it('peut rester vide pendant la frappe, au lieu de retomber à zéro', () => {
    expect(UI).toContain("points: chiffres === '' ? '' : Math.max(1, Number(chiffres))");
    expect(UI).not.toContain("Math.max(0, Number(e.target.value.replace(/[^\\d]/g, '')) || 0)");
  });

  it('revient à 1 quand on la quitte sans rien y mettre', () => {
    expect(UI).toContain("if (q.points === '') majQuestion(i, { points: 1 })");
  });

  it('une case laissée vide vaut 1 point à l’enregistrement, jamais 0', () => {
    expect(UI).toContain("points: q.points === '' ? 1 : q.points");
  });
});

describe('le filet de validation reste en place', () => {
  const question = {
    id: 'q1',
    enonce: 'Qu’est-ce que l’IA générative ?',
    choix: ['Un système qui produit des contenus nouveaux', 'Un antivirus'],
    bonnes: [0],
    points: 1,
  };

  it('accepte une question à un point', () => {
    expect(problemesDuQuiz([question])).toEqual([]);
  });

  it('refuse toujours une question à zéro point', () => {
    const problemes = problemesDuQuiz([{ ...question, points: 0 }]);
    expect(problemes).toHaveLength(1);
    expect(problemes[0]?.motif).toContain('supérieur à zéro');
  });
});
