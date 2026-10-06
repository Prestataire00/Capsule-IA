import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('s’ajouter en scannant le QR de la salle', () => {
  const action = lire('../app/(apprenant)/signer/salle/[sheetId]/actions.ts');

  it('seulement après un laissez-passer valide du QR, et à la demande explicite', () => {
    expect(action.indexOf('checkRoomPass(')).toBeLessThan(action.indexOf('sInscrireEnSalle(sheet.sessionId'));
    expect(action).toContain("trouve.error === 'room_name_unknown' && input.ajouter === true");
  });

  it('l’équipe est prévenue pour régulariser', () => {
    expect(action).toContain("template_code: 'emargement.ajout_jour_j'");
  });

  it('le cœur de l’inscription n’est pas une action appelable depuis le navigateur', () => {
    const coeur = lire('../features/attendance/inscrire-jour-j.ts');
    expect(coeur).toContain("import 'server-only';");
    expect(coeur).not.toContain("'use server'");
  });
});
