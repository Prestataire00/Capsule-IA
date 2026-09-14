// Garde-fou : `audit.audit_row()` doit rester SECURITY DEFINER.
//
// `CREATE OR REPLACE FUNCTION` remplace la définition entière, attribut de
// sécurité compris. L'omettre fait repasser la fonction en SECURITY INVOKER :
// le déclencheur s'exécute alors avec les droits de l'utilisateur connecté, qui
// n'a rien sur le schéma `audit`. Toute écriture dans une table auditée échoue
// — « permission denied for schema audit » — et la transaction est annulée.
//
// C'est arrivé quatre fois (0090, 0104, 0138, puis la 0168 qui a défait la
// 0138 et bloqué la production : plus aucune session ne pouvait être créée).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/** Découpe le fichier sur chaque redéfinition de la fonction, en gardant l'en-tête. */
function enTetesAuditRow(sql: string): string[] {
  const morceaux = sql.split(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+audit\.audit_row\s*\(\s*\)/i);
  // Le premier morceau précède la première occurrence : il ne nous intéresse pas.
  return morceaux.slice(1).map((m) => m.slice(0, m.indexOf('AS $$') === -1 ? 400 : m.indexOf('AS $$')));
}

describe('déclencheur d’audit', () => {
  const fichiers = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  it('trouve bien les migrations (le test ne doit pas passer à vide)', () => {
    expect(fichiers.length).toBeGreaterThan(100);
  });

  it('ne redéfinit jamais audit_row sans SECURITY DEFINER', () => {
    const fautives: string[] = [];

    for (const f of fichiers) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
      for (const entete of enTetesAuditRow(sql)) {
        if (!/SECURITY\s+DEFINER/i.test(entete)) fautives.push(f);
      }
    }

    expect(
      fautives,
      'migrations qui recréent audit.audit_row() sans SECURITY DEFINER : elles bloquent toute écriture auditée',
    ).toEqual(['0015_triggers.sql', '0168_audit_table_sans_id.sql']);
  });

  it('la dernière redéfinition en date rétablit SECURITY DEFINER', () => {
    const avecAuditRow = fichiers.filter((f) =>
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+audit\.audit_row/i.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')),
    );
    const derniere = avecAuditRow[avecAuditRow.length - 1]!;
    const sql = fs.readFileSync(path.join(MIGRATIONS, derniere), 'utf8');

    expect(derniere, 'la dernière migration touchant audit_row').not.toBe('0168_audit_table_sans_id.sql');
    expect(/SECURITY\s+DEFINER/i.test(sql), `${derniere} doit poser SECURITY DEFINER`).toBe(true);
  });
});
