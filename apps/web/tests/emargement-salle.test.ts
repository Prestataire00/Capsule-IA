// Émargement en salle (modèle Edusign) : QR tournant projeté, identification, écran en direct.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROTATION_MS,
  checkRoomCode,
  checkRoomPass,
  learnerCookie,
  nomProjete,
  readLearnerCookie,
  roomCode,
  roomPass,
  roomSlot,
} from '@/features/attendance/room-code';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const CLE = 'cle-de-test-cle-de-test-cle-de-test';
const FEUILLE = '00000000-0000-4000-8000-000000000001';
const T0 = 1_780_000_000_000;

describe('QR tournant', () => {
  it('accepte le code courant et le précédent, pas au-delà (20 s au plus)', () => {
    const code = roomCode(CLE, FEUILLE, roomSlot(T0));
    expect(checkRoomCode(CLE, FEUILLE, code, T0)).toBe(true);
    expect(checkRoomCode(CLE, FEUILLE, code, T0 + ROTATION_MS)).toBe(true);
    expect(checkRoomCode(CLE, FEUILLE, code, T0 + 2 * ROTATION_MS)).toBe(false);
  });

  it('lie le code à la feuille et à la clé', () => {
    const code = roomCode(CLE, FEUILLE, roomSlot(T0));
    expect(checkRoomCode(CLE, '00000000-0000-4000-8000-000000000002', code, T0)).toBe(false);
    expect(checkRoomCode('autre-cle-autre-cle-autre-cle-autre', FEUILLE, code, T0)).toBe(false);
    expect(checkRoomCode(CLE, FEUILLE, undefined, T0)).toBe(false);
  });
});

describe('identification', () => {
  it('laisse dix minutes pour saisir son e-mail après le scan', () => {
    const pass = roomPass(CLE, FEUILLE, T0);
    expect(checkRoomPass(CLE, FEUILLE, pass, T0 + 9 * 60_000)).toBe(true);
    expect(checkRoomPass(CLE, FEUILLE, pass, T0 + 11 * 60_000)).toBe(false);
    expect(checkRoomPass(CLE, FEUILLE, pass.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), T0)).toBe(false);
  });

  it('reconnaît l’apprenant par un cookie signé, jamais par un identifiant nu', () => {
    const id = '00000000-0000-4000-8000-0000000000aa';
    const cookie = learnerCookie(CLE, id, T0);
    expect(readLearnerCookie(CLE, cookie, T0 + 1000)).toBe(id);
    expect(readLearnerCookie(CLE, cookie.replace(id, '00000000-0000-4000-8000-0000000000bb'), T0)).toBeNull();
    expect(readLearnerCookie(CLE, id, T0)).toBeNull();
  });

  it('projette « Prénom N. » plutôt que le nom complet', () => {
    expect(nomProjete('Anissa Fiévé')).toBe('Anissa F.');
    expect(nomProjete('Jean Pierre de la Tour')).toBe('Jean T.');
  });
});

describe('garde-fous', () => {
  it('un téléphone n’émarge qu’une personne par feuille', () => {
    const room = lire('../features/attendance/room.ts');
    expect(room).toContain(".neq('signer_id' as never, input.learnerId as never)");
    expect(room).toContain("channel: 'salle'");
  });

  it('la base décide du mode « qr » pour le canal salle', () => {
    const sql = lire('../../../supabase/migrations/0148_emargement_qr_salle.sql');
    expect(sql).toContain("ELSIF v_channel = 'salle' THEN");
    expect(sql).toContain("issued_channel IN ('email', 'espace', 'equipe', 'salle')");
    expect(sql).toContain("CHECK (issued_channel IS DISTINCT FROM 'salle' OR device_id IS NOT NULL)");
  });

  it('l’écran en direct est réservé à qui gère la feuille', () => {
    expect(lire('../app/api/attendance/[sheetId]/live/route.ts')).toContain('accessibleSheet(params.sheetId)');
    expect(lire('../app/(projection)/projection/[sheetId]/page.tsx')).toContain('accessibleSheet(params.sheetId)');
  });

  it('l’écran de projection n’embarque aucun code serveur', () => {
    const ecran = lire('../app/(projection)/projection/[sheetId]/room-projector.tsx');
    expect(ecran).not.toContain('room-code');
    expect(lire('../features/attendance/room-live.ts')).not.toContain('import');
  });
});
