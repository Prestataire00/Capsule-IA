// Émargement, étape 4 : heures réellement suivies, RGPD, sorties (PDF, CSV), compteurs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SQL = lire('../../../supabase/migrations/0146_emargement_heures_rgpd.sql');

describe('heures suivies (0146)', () => {
  it('compte chaque demi-journée sur sa fenêtre, retards et départs déduits', () => {
    expect(SQL).toContain('CROSS JOIN LATERAL app.attendance_sheet_window(sh.id) w');
    expect(SQL).toContain('f.late_arrival_time');
    expect(SQL).toContain('f.early_departure_time');
    expect(SQL).not.toContain('bool_or(sig.status');
  });

  it('recalcule dès la signature, sans dépendre d’une tâche programmée', () => {
    expect(SQL).toContain('PERFORM app.recompute_dossier_hours(d.id)');
    expect(SQL).toMatch(/AFTER INSERT OR UPDATE OF status, late_arrival_time, early_departure_time/);
  });

  it('retire le droit d’écrire le suivi des heures aux membres', () => {
    expect(SQL).toContain('DROP POLICY IF EXISTS dossier_hours_tracking_rw');
    expect(SQL).toMatch(/dossier_hours_tracking_select ON app\.dossier_hours_tracking\s+FOR SELECT/);
  });

  it('laisse la purge et l’anonymisation effacer IP et navigateur après clôture', () => {
    expect(SQL).toContain("v_pii CONSTANT TEXT[] := ARRAY['signer_ip', 'signer_user_agent', 'signer_country'");
    expect(SQL).toContain('tg_attendance_signature_pii_sync');
  });
});

describe('sorties et compteurs', () => {
  it('fonde le taux des attestations sur les heures suivies', () => {
    const taux = lire('../features/attendance/attendance-rate.ts');
    expect(taux).toContain("rpc('recompute_dossier_hours'");
    expect(taux).not.toContain(".not('signed_at', 'is', null)");
  });

  it('répare l’export CSV et y inclut les sessions de groupe', () => {
    const exp = lire('../app/api/emargements/export.csv/route.ts');
    expect(exp).not.toContain('start_at,');
    expect(exp).toContain('sessions(starts_at, title)');
    expect(exp).toContain("feuillesDe().in('session_id', seanceIds)");
    expect(exp).not.toContain('.or(');
  });

  it('présente entrée et sortie sur le PDF clôturé', () => {
    const pdf = lire('../features/attendance/pdf-render.tsx');
    expect(pdf).toContain('<Text style={styles.cSig}>Sortie</Text>');
    expect(pdf).toContain('absenceReason');
  });

  it('ne compte plus un statut « signed » qui n’existe pas', () => {
    expect(lire('../features/sessions/load-session.ts')).not.toContain("r.status === 'signed'");
    expect(lire('../app/(dashboard)/formations/[id]/page.tsx')).not.toContain("s.status === 'signed'");
  });
});
