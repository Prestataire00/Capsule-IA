// Garde-fou : une page serveur ne peut pas APPELER une fonction exportée par
// un module « use client » (Next plante au rendu, le build ne le voit pas).
// Bug réel du 2026-09-11 : `emargementEnCours`, exportée depuis live-refresh.tsx,
// faisait planter l'onglet Émargement de la session, la feuille du dossier et
// l'émargement de l'espace formateur.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { emargementEnCours } from '@/features/attendance/live-window';

const WEB = path.resolve(__dirname, '..');
const lire = (rel: string) => fs.readFileSync(path.join(WEB, rel), 'utf-8');

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('fonctions de modules client appelées côté serveur', () => {
  it('le module client du rafraîchissement n’exporte que le composant', () => {
    expect(lire('features/attendance/live-refresh.tsx')).not.toMatch(/export function [a-z]/);
  });

  it('aucune page serveur n’importe emargementEnCours depuis un module client', () => {
    const fautives = fichiers(path.join(WEB, 'app')).filter((f) => {
      const src = fs.readFileSync(f, 'utf-8');
      return !src.startsWith("'use client'") && /import \{[^}]*emargementEnCours[^}]*\} from '@\/features\/attendance\/live-refresh'/.test(src);
    });
    expect(fautives.map((f) => path.relative(WEB, f))).toEqual([]);
  });

  it('fenêtre d’émargement : ouverte une heure avant, fermée deux heures après', () => {
    const f = [{ windowStart: '2026-09-14T07:00:00Z', windowEnd: '2026-09-14T10:30:00Z', finalized: false }];
    expect(emargementEnCours(f, Date.parse('2026-09-14T06:30:00Z'))).toBe(true);
    expect(emargementEnCours(f, Date.parse('2026-09-14T13:00:00Z'))).toBe(false);
    expect(emargementEnCours([{ ...f[0]!, finalized: true }], Date.parse('2026-09-14T08:00:00Z'))).toBe(false);
  });
});
