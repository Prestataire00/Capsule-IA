// « Je dois pouvoir mettre du … au …, et surtout dupliquer les horaires sur
// tous les jours de formation. » Demande d'Ismael du 21/09/2026.
//
// Le formulaire ne connaissait qu'une date unique. Les demi-journées existaient
// déjà : il manquait la période et la répétition.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/dossiers/[id]/sessions/session-actions.ts');
const FORM = lire('../app/(dashboard)/dossiers/[id]/sessions/_components/session-form.tsx');

describe('le formulaire', () => {
  it('propose une période, pas seulement un jour', () => {
    expect(FORM).toContain('label="Du"');
    expect(FORM).toContain('label="Au"');
  });

  it('laisse choisir les jours de la semaine, week-end exclu par défaut', () => {
    expect(FORM).toContain('JOURS_OUVRES');
    expect(FORM).toContain('Jours de formation');
  });

  it('annonce ce qui sera créé avant de le créer', () => {
    expect(FORM).toContain('resumePlanification');
    expect(FORM).toContain('{apercu}');
  });

  it('calcule l’aperçu avec la même règle que le serveur', () => {
    // Deux calculs séparés finiraient par annoncer un nombre de séances et en
    // créer un autre.
    expect(FORM).toContain('genererSeances({');
    expect(ACTIONS).toContain('genererSeances({');
  });

  it('n’a qu’un seul chemin de création : la journée unique est le cas simple', () => {
    expect(FORM).toContain('creerSeancesEnSerie({');
    expect(FORM).not.toContain('await createSession(');
  });
});

describe('la création en série', () => {
  it('convertit au fuseau de Paris côté serveur', () => {
    // `new Date('2026-10-06T09:00')` dans le navigateur dépend du fuseau du
    // poste : un administrateur en déplacement décalerait toutes les séances.
    expect(ACTIONS).toContain('parisIso(s.date, s.debut)');
    expect(ACTIONS).toContain('parisIso(s.date, s.fin)');
  });

  it('ne nomme le créneau que s’il y en a deux', () => {
    expect(ACTIONS).toContain('plusieursCreneaux ? `${input.title.trim()} (${s.libelle})` : input.title.trim()');
  });

  it('dit combien de séances ont été créées quand une échoue', () => {
    // Mieux vaut une série incomplète annoncée qu'un doute.
    expect(ACTIONS).toContain('séance(s) déjà créée(s)');
  });

  it('réutilise la création unitaire, avec tous ses effets', () => {
    // Feuilles d'émargement par trigger, participants dérivés, devis : les
    // réécrire en lot les aurait perdus.
    const bloc = ACTIONS.slice(ACTIONS.indexOf('export async function creerSeancesEnSerie'));
    expect(bloc).toContain('await createSession({');
  });
});
