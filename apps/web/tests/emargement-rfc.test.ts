// Émargement façon RFC : synthèse par séance, grille de la session, page cliquable.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { syntheseSeance } from '@/features/attendance/session-attendance-summary';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('synthèse d’une séance', () => {
  const feuilles = ['matin', 'aprem'];
  const inscrits = ['a', 'b'];

  it('présence = présents (retards compris) ÷ cases remplies ; complétion = remplies ÷ attendues', () => {
    const s = syntheseSeance(feuilles, inscrits, [
      { sheetId: 'matin', learnerId: 'a', status: 'present', signedAt: 'x', selfSigned: true },
      { sheetId: 'matin', learnerId: 'b', status: 'late', signedAt: 'x', selfSigned: true },
      { sheetId: 'aprem', learnerId: 'a', status: 'absent', signedAt: null, selfSigned: false },
    ]);
    expect(s.attendues).toBe(4);
    expect(s.remplies).toBe(3);
    expect(s.presents).toBe(2);
    expect(s.retards).toBe(1);
    expect(s.tauxPresence).toBeCloseTo(2 / 3);
    expect(s.completion).toBeCloseTo(3 / 4);
    expect(s.signatures).toBe(2);
  });

  it('ignore les signataires non inscrits et les doublons ; rien d’attendu → pas de taux', () => {
    const s = syntheseSeance(feuilles, inscrits, [
      { sheetId: 'matin', learnerId: 'z', status: 'present', signedAt: 'x', selfSigned: true },
      { sheetId: 'matin', learnerId: 'a', status: 'present', signedAt: 'x', selfSigned: true },
      { sheetId: 'matin', learnerId: 'a', status: 'present', signedAt: 'x', selfSigned: true },
    ]);
    expect(s.presents).toBe(1);
    expect(syntheseSeance([], [], []).tauxPresence).toBeNull();
  });
});

describe('écrans', () => {
  it('chaque ligne de la page Émargements ouvre la grille de sa séance', () => {
    expect(lire('../app/(dashboard)/emargements/page.tsx')).toContain('href={`/sessions/${l.id}/emargements`}');
  });

  it('la grille propose QR, tous présents, envoi à tous et signature du formateur', () => {
    const grille = lire('../app/(dashboard)/sessions/[id]/emargements/attendance-matrix.tsx');
    for (const t of ['/projection/', 'Tous présents', 'Envoyer à tous', 'Signer formateur']) expect(grille).toContain(t);
  });

  it('« Tous présents » est gardé et ne touche que les apprenants non émargés', () => {
    const actions = lire('../app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts');
    const bloc = actions.slice(actions.indexOf('export async function markAllPresent'), actions.indexOf('export async function attestExit'));
    expect(bloc).toContain('await accessibleSheet(input.sheetId)');
    expect(bloc).toContain("p.state === 'a_signer'");
  });
});
