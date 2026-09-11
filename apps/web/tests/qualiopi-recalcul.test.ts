// La conformité d'un dossier ne suivait pas son activité : un questionnaire
// complété ou un émargement finalisé restait sans effet jusqu'au recalcul
// suivant (0143). Ces tests verrouillent les déclencheurs et l'indicateur 9.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { guidanceFor } from '@/features/dossier/qualiopi-guidance';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const MIGRATION = lire('../../../supabase/migrations/0143_qualiopi_recalcul_evenementiel.sql');

describe('recalcul Qualiopi déclenché par l’activité (0143)', () => {
  it.each(['questionnaire_assignments', 'attendance_sheets', 'qualiopi_proofs', 'email_log', 'documents'])(
    'recalcule quand %s change',
    (table) => {
      expect(MIGRATION).toMatch(new RegExp(`CREATE TRIGGER \\w+\\n  AFTER [^;]* ON app\\.${table}\\b`));
    },
  );

  it('ne recalcule pas un dossier en cours de suppression', () => {
    expect(MIGRATION).toContain('EXISTS (SELECT 1 FROM app.dossiers WHERE id = v_new)');
  });

  it('valide l’indicateur 9 par une convocation réellement envoyée', () => {
    expect(MIGRATION).toContain("SET auto_checks = ARRAY['convocation_sent']");
    expect(MIGRATION).toContain("e.status = 'sent'");
  });

  it('journalise la convocation J-7 avec son dossier', () => {
    const route = lire('../app/api/cron/transactional-emails/route.ts');
    expect(route).toContain("kind: 'convocation_j7'");
    expect(route).toContain('dossierId: dossier.id');
  });

  it('oriente l’indicateur 9 vers la convocation', () => {
    expect(guidanceFor(9, 'proof').todo).toMatch(/convocation/);
    expect(guidanceFor(9, 'proof').linkLabel).toBe('Générer la convocation');
  });
});
