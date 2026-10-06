import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('fusion de deux fiches formateur', () => {
  const action = lire('../app/(dashboard)/formateurs/fusion-actions.ts');
  const sql = lire('../../../supabase/migrations/0214_fusion_formateurs.sql');

  it('réservée à qui gère les dossiers, sur deux fiches de son organisme', () => {
    expect(action).toContain("guardAction('dossiers')");
    expect(action).toContain(".eq('organization_id', garde.member.organizationId)");
    expect(action).toContain('(data ?? []).length !== 2');
  });

  it('en base, toutes les tables qui référencent la fiche, sans lien en double', () => {
    expect(sql).toContain("con.confrelid = 'app.trainers'::regclass");
    expect(sql).toContain('EXCEPTION WHEN unique_violation THEN');
    expect(sql).toContain('fusionne_dans');
    expect(sql).toContain('REVOKE ALL ON FUNCTION app.fusionner_formateurs(UUID, UUID) FROM PUBLIC, anon, authenticated;');
  });
});
