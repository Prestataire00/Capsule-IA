// Émargement : correctifs de l'audit (sécurité, exactitude, conformité) — 0147 et application.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { attestExitSchema, markSchema } from '@/features/attendance/schemas';
import { isSelfSigned } from '@/features/attendance/completeness';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SQL = lire('../../../supabase/migrations/0147_emargement_audit.sql');

describe('sécurité', () => {
  it('ne remet l’espace apprenant qu’à la sortie, et pour un lien reçu par l’apprenant', () => {
    const action = lire('../app/(apprenant)/signer/[token]/actions.ts');
    expect(action).toContain("r.channel === 'email' || r.channel === 'espace'");
    expect(action).toContain("input.moment === 'exit'");
    expect(lire('../app/(apprenant)/signer/[token]/page.tsx')).not.toContain('generateApprenantUrl');
  });

  it('trace le canal et l’émetteur de chaque lien', () => {
    const lien = lire('../features/attendance/issue-attendance-link.ts');
    expect(lien).toContain('issued_channel: input.channel');
    expect(lire('../app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts')).toContain("channel: 'equipe'");
    expect(SQL).toContain("v_mode := 'lien_equipe'");
  });

  it('exige un rôle qui gère l’émargement', () => {
    expect(lire('../features/attendance/access.ts')).toContain("can(membre.role, 'attendance') !== 'manage'");
  });

  it('ne se fie plus aux en-têtes falsifiables pour l’adresse de preuve', () => {
    const step = lire('../features/attendance/record-step.ts');
    expect(step).not.toContain("h.get('cf-connecting-ip')");
    expect(step).toContain('isIP(candidat)');
  });

  it('ferme la création de feuilles et les fonctions d’émargement aux rôles publics', () => {
    expect(SQL).toContain("'app.materialize_attendance_slots(uuid)'");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
  });

  it('n’accepte le secret des tâches que dans l’en-tête', () => {
    const cron = lire('../app/api/cron/emargement-liens/route.ts');
    expect(cron).toContain('timingSafeEqual');
    expect(cron).not.toContain('searchParams');
  });

  it('réserve l’export à l’équipe', () => {
    expect(lire('../app/api/emargements/export.csv/route.ts')).toContain("membre.role === 'formateur'");
  });
});

describe('exactitude', () => {
  it('sépare le matin de l’après-midi par la pause déjeuner de l’organisme', () => {
    expect(SQL).toContain('attendance_lunch_start TIME NOT NULL DEFAULT');
    expect(SQL).toContain('v_matin := v_start < s.pause');
  });

  it('retire les feuilles fantômes après une replanification', () => {
    expect(SQL).toContain("(sh.half_day = 'morning' AND NOT v_matin)");
  });

  it('verrouille aussi les insertions et la clôture en cours', () => {
    expect(SQL).toContain('BEFORE INSERT OR UPDATE OR DELETE ON app.attendance_signatures');
    expect(SQL).toContain("v_sheet_status IN ('finalized', 'completed')");
    expect(lire('../app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts')).toContain(".update({ status: 'completed' })");
  });

  it('compte les feuilles de groupe pour Qualiopi', () => {
    expect(SQL).toContain('OR s.session_id IN (SELECT sd.session_id FROM app.session_dossiers sd WHERE sd.dossier_id = p_dossier_id)');
  });

  it('permet de marquer un formateur et d’attester une sortie oubliée', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(markSchema.parse({ sheetId: id, learnerId: id, signerKind: 'trainer', status: 'present' }).signerKind).toBe('trainer');
    expect(attestExitSchema.safeParse({ sheetId: id, learnerId: id, exitTime: '17:00' }).success).toBe(true);
    expect(attestExitSchema.safeParse({ sheetId: id, learnerId: id, exitTime: '5pm' }).success).toBe(false);
  });

  it('reconnaît un lien remis par l’équipe comme une signature de la personne', () => {
    expect(isSelfSigned({ captureMode: 'lien_equipe', evidenceSource: 'qr', signedAt: 'x' })).toBe(true);
  });
});

describe('conformité', () => {
  it('déclare les heures suivies sur le certificat de réalisation', () => {
    // La génération a quitté la route pour `build-certificat-pdf`, partagée
    // avec l'envoi automatique à l'entreprise : c'est là que la règle vit.
    const cert = lire('../features/documents/build-certificat-pdf.ts');
    expect(cert).toContain('Number(hours.hours_attended)');
  });

  it('confie les tâches programmées à la base, sans double déclenchement GitHub', () => {
    expect(SQL).toContain("cron.schedule('capsule_emargement_liens'");
    expect(lire('../../../.github/workflows/transactional-emails.yml')).not.toContain('schedule:');
  });

  it('ne réserve la confirmation sans tracé qu’aux séances entièrement à distance', () => {
    expect(SQL).toContain("p_capture_mode = 'visio' AND v_modality = 'distanciel'");
    expect(lire('../app/(apprenant)/signer/[token]/signer-form.tsx')).toContain("context.modality === 'distanciel'");
  });
});
