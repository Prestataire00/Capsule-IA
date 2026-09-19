// Une vue est une lecture de tables protégées par RLS. Sans
// `security_invoker = true`, elle s'exécute avec les droits de son
// propriétaire (postgres, qui contourne la RLS) et perce la protection au lieu
// de la relayer.
//
// Incident du 19/09/2026 : `app.v_dossiers_overview`, recréée « à l'identique »
// par la 0095 sans le drapeau, renvoyait à la clé anonyme les dossiers réels
// avec nom, e-mail et montant. Ce test empêche le retour du même oubli.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const fichiers = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Tout le SQL, commentaires retirés : `-- CREATE VIEW …` n'est pas une vue. */
const sansCommentaires = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const TOUT = fichiers.map((f) => sansCommentaires(fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8'))).join('\n');

type Vue = { nom: string; fichier: string; invoker: boolean };

/** Chaque CREATE VIEW du dépôt, avec ou sans le drapeau. */
function vuesCreees(): Vue[] {
  const vues: Vue[] = [];
  for (const f of fichiers) {
    const sql = sansCommentaires(fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8'));
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([a-z_]+\.[a-z_]+)([\s\S]{0,120}?)\bAS\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      vues.push({ nom: m[1] ?? '', fichier: f, invoker: /security_invoker\s*=\s*true/i.test(m[2] ?? '') });
    }
  }
  return vues;
}

describe('vues et RLS', () => {
  const vues = vuesCreees();

  it('le dépôt déclare bien des vues (le détecteur n’est pas muet)', () => {
    expect(vues.length).toBeGreaterThan(3);
  });

  it('chaque vue finit en security_invoker, par sa création ou par un ALTER', () => {
    const percees = [...new Set(vues.filter((v) => !v.invoker).map((v) => v.nom))].filter((nom) => {
      // Une création ultérieure avec le drapeau, ou un ALTER explicite, répare.
      const repareeParAlter = new RegExp(
        `ALTER\\s+VIEW\\s+${nom.replace('.', '\\.')}\\s+SET\\s*\\(\\s*security_invoker\\s*=\\s*true`,
        'i',
      ).test(TOUT);
      const derniereCreation = vues.filter((v) => v.nom === nom).at(-1);
      return !repareeParAlter && !derniereCreation?.invoker;
    });
    expect(percees, `vues sans security_invoker : ${percees.join(', ')}`).toEqual([]);
  });

  it('aucune vue matérialisée ne survit : la RLS ne s’y applique jamais', () => {
    const creees = [...TOUT.matchAll(/CREATE\s+MATERIALIZED\s+VIEW\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => m[1] ?? '');
    const supprimees = [...TOUT.matchAll(/DROP\s+MATERIALIZED\s+VIEW\s+(?:IF\s+EXISTS\s+)?([a-z_]+\.[a-z_]+)/gi)].map(
      (m) => m[1] ?? '',
    );
    const restantes = [...new Set(creees)].filter((v) => !supprimees.includes(v));
    expect(restantes, `vues matérialisées encore en place : ${restantes.join(', ')}`).toEqual([]);
  });

  it('la vue de l’incident est explicitement réparée et fermée à anon', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, '0179_vue_dossiers_fuite_anon.sql'), 'utf-8');
    expect(sql).toContain('ALTER VIEW app.v_dossiers_overview SET (security_invoker = true)');
    expect(sql).toContain('REVOKE ALL ON app.v_dossiers_overview FROM anon');
  });
});
