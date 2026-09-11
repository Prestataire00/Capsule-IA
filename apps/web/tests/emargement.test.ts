// Émargement (0145) : règles de complétude, saisies de l'équipe, gardes des actions.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSelfSigned, participantState, sheetReady, type SignatureFacts } from '@/features/attendance/completeness';
import { attendanceErrorCode, attendanceErrorLabel, markSchema } from '@/features/attendance/schemas';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const base: SignatureFacts = { status: 'present', signedAt: '2026-09-11T07:05:00Z', exitSignedAt: null, captureMode: 'lien', evidenceSource: 'qr', earlyDeparture: null };

describe('état d’un participant', () => {
  it('attend l’entrée puis la sortie d’un apprenant', () => {
    expect(participantState('learner', null)).toBe('a_signer');
    expect(participantState('learner', base)).toBe('entree_seule');
    expect(participantState('learner', { ...base, exitSignedAt: '2026-09-11T11:00:00Z' })).toBe('complet');
    expect(participantState('learner', { ...base, earlyDeparture: '10:30:00' })).toBe('complet');
  });

  it('accepte une présence attestée par l’équipe ou par Zoom', () => {
    expect(participantState('learner', { ...base, captureMode: 'grille', evidenceSource: 'trainer_override' })).toBe('complet');
    expect(participantState('learner', { ...base, captureMode: null, evidenceSource: 'zoom_api' })).toBe('complet');
  });

  it('traite les absents, excusés ou non', () => {
    expect(participantState('learner', { ...base, status: 'absent', signedAt: null })).toBe('absent');
    expect(participantState('learner', { ...base, status: 'absent_justified', signedAt: null })).toBe('excuse');
  });

  it('fait signer le formateur une seule fois', () => {
    expect(participantState('trainer', base)).toBe('complet');
    expect(participantState('trainer', null)).toBe('a_signer');
  });

  it('reconnaît les signatures d’avant la refonte', () => {
    expect(isSelfSigned({ captureMode: null, evidenceSource: 'qr', signedAt: 'x' })).toBe(true);
    expect(isSelfSigned({ captureMode: null, evidenceSource: 'trainer_override', signedAt: 'x' })).toBe(false);
  });

  it('ne clôture qu’une feuille entièrement traitée', () => {
    expect(sheetReady([])).toBe(false);
    expect(sheetReady(['complet', 'absent', 'excuse'])).toBe(true);
    expect(sheetReady(['complet', 'entree_seule'])).toBe(false);
  });
});

describe('saisies de l’équipe', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('exige un motif pour une absence excusée', () => {
    expect(markSchema.safeParse({ sheetId: id, learnerId: id, status: 'absent_justified' }).success).toBe(false);
    expect(markSchema.safeParse({ sheetId: id, learnerId: id, status: 'absent_justified', reason: 'Arrêt maladie' }).success).toBe(true);
  });
  it('refuse une heure de retard pour un absent', () => {
    expect(markSchema.safeParse({ sheetId: id, learnerId: id, status: 'absent', lateArrival: '09:30' }).success).toBe(false);
    expect(markSchema.safeParse({ sheetId: id, learnerId: id, status: 'late', lateArrival: '9h30' }).success).toBe(false);
  });
  it('traduit les refus de la base', () => {
    expect(attendanceErrorCode('ERROR: token_entry_used')).toBe('token_entry_used');
    expect(attendanceErrorLabel('outside_signing_window')).toMatch(/pas ouverte/);
    expect(attendanceErrorLabel('???')).toMatch(/Réessayez/);
  });
});

describe('gardes et réparation', () => {
  const actions = lire('../app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts');

  it('vérifie l’accès dans chaque action de l’équipe', () => {
    const blocs = actions.split(/export async function /).slice(1);
    expect(blocs.length).toBeGreaterThanOrEqual(8);
    for (const b of blocs) expect(b).toMatch(/accessibleSheet\(|accessibleSession\(|auth\.getUser\(\)/);
  });

  it('n’émet plus de lien sans l’enregistrer', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../features/attendance/generate-signature-url.ts'))).toBe(false);
    expect(lire('../features/attendance/issue-attendance-link.ts')).toContain("from('attendance_token_jtis'");
  });

  it('ne remplace plus une image de signature existante', () => {
    const step = lire('../features/attendance/record-step.ts');
    expect(step).toContain('upsert: false');
    expect(step).not.toContain('upsert: true');
  });

  it('écrit des événements conformes à la table', () => {
    const sql = lire('../../../supabase/migrations/0145_emargement_entree_sortie.sql');
    expect(sql).not.toMatch(/domain_events \([^)]*\bkind\b/);
    expect(sql.match(/INSERT INTO infra\.domain_events \(organization_id, aggregate_type, aggregate_id, type, payload\)/g)?.length).toBe(2);
  });
});
