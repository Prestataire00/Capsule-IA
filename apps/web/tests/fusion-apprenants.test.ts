import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('doublons d’apprenants dans un dossier', () => {
  const action = lire('../app/(dashboard)/dossiers/[id]/apprenants/fusion-actions.ts');
  const sql = lire('../../../supabase/migrations/0216_fusion_apprenants.sql');

  it('réservé à qui gère les dossiers, sur deux fiches de son organisme', () => {
    expect(action).toContain("guardAction('dossiers')");
    expect(action).toContain(".eq('organization_id', garde.member.organizationId)");
  });
  it('la fusion garde signatures et questionnaires (toutes les tables), sans doublon de lien', () => {
    expect(sql).toContain("con.confrelid = 'app.learners'::regclass");
    expect(sql).toContain('EXCEPTION WHEN unique_violation THEN');
  });
  it('la liste des apprenants du dossier propose de réunir les doublons', () => {
    expect(lire('../app/(dashboard)/dossiers/[id]/apprenants/page.tsx')).toContain('<DoublonsAFusionner');
  });
});
