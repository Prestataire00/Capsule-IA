// Les actions de planification écrivent en service role : sans garde, tout
// utilisateur connecté — un formateur, le membre d'un autre organisme —
// créait des séances dans n'importe quel dossier (audit du 07/10/2026).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../app/(dashboard)/dossiers/[id]/sessions/session-actions.ts'), 'utf8');
const corps = (nom: string) => {
  const debut = SRC.indexOf(`export async function ${nom}(`);
  const suite = SRC.indexOf('\nexport ', debut + 10);
  return SRC.slice(debut, suite === -1 ? undefined : suite);
};

describe('planifier exige le droit sur le dossier', () => {
  it.each(['createSession', 'creerSeancesEnSerie', 'generateMeetForSession'])('%s vérifie rôle et organisme avant d’écrire', (nom) => {
    const b = corps(nom);
    expect(b).toContain("guardRowAction('");
    expect(b.indexOf('guardRowAction')).toBeLessThan(b.indexOf('admin()') === -1 ? Infinity : b.indexOf('admin()'));
  });
});
