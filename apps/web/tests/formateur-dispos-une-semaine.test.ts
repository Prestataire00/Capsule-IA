// « Mes disponibilités » empilait les cinq semaines déclarables : une page à
// dérouler, où l'on perdait de vue celle qu'on remplissait. Ismael a demandé le
// 2026-09-16 une semaine à la fois, comme le planning de l'espace administrateur
// (`/planning?week=`, flèches + retour à la semaine courante).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const UI = fs.readFileSync(
  path.resolve(__dirname, '../app/(formateur)/mon-planning/disponibilites.client.tsx'),
  'utf-8',
);

describe('disponibilités du formateur, une semaine à la fois', () => {
  it('n’empile plus les semaines', () => {
    expect(UI).not.toContain('semaines.map(');
  });

  it('n’affiche que la semaine choisie', () => {
    expect(UI).toContain('const semaine = semaines[Math.min(index, Math.max(0, semaines.length - 1))]');
    expect(UI).toContain('{semaine && (');
  });

  it('se déplace d’une semaine, sans sortir des bornes', () => {
    expect(UI).toContain('setIndex((n) => Math.max(0, n - 1))');
    expect(UI).toContain('setIndex((n) => Math.min(semaines.length - 1, n + 1))');
    expect(UI).toContain('disabled={index === 0}');
    expect(UI).toContain('disabled={index >= semaines.length - 1}');
  });

  it('propose le retour à la semaine courante, comme l’espace administrateur', () => {
    expect(UI).toContain('Cette semaine');
    expect(UI).toContain('onClick={() => setIndex(0)}');
  });

  it('dit où l’on en est dans les semaines déclarables', () => {
    expect(UI).toContain('Semaine {index + 1} sur {semaines.length}');
  });

  it('garde les raccourcis « tout dispo / tout indispo » sur la semaine affichée', () => {
    expect(UI).toContain("toutePlaSemaine(semaine, 'disponible')");
    expect(UI).toContain("toutePlaSemaine(semaine, 'indisponible')");
  });
});
