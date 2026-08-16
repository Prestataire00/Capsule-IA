// Garde-fou anti-régression : un `.rpc()` sans `.schema('app')` cible `public`.
// Les fonctions qui ne vivent que dans `app` échouent alors en renvoyant une
// erreur dans `{ error }` — jamais une exception — donc le bug est silencieux
// (bug réel : l'émargement par lien signé, corrigé le 2026-08-16).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(WEB_ROOT, '../../supabase/migrations');
const SKIP_DIRS = new Set(['node_modules', '.next', 'tests']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** Fonctions exposées dans le schéma `public` (appelables sans `.schema('app')`). */
function publicFunctions(): Set<string> {
  const names = new Set<string>();
  for (const f of fs.readdirSync(MIGRATIONS)) {
    if (!f.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)) {
      names.add(m[1]!.toLowerCase());
    }
  }
  return names;
}

describe("appels .rpc() et schéma Postgres", () => {
  it("n'appelle sans .schema('app') que des fonctions définies dans public", () => {
    const exposed = publicFunctions();
    const offenders: string[] = [];

    for (const file of walk(WEB_ROOT)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/\.rpc\(\s*'(\w+)'/g)) {
          const fn = m[1]!;
          // Le chaînage peut s'étaler sur plusieurs lignes : sb\n.schema('app')\n.rpc(...)
          const context = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
          if (context.includes("schema('app')")) continue;
          if (exposed.has(fn.toLowerCase())) continue;
          offenders.push(`${path.relative(WEB_ROOT, file)}:${i + 1} → ${fn}()`);
        }
      });
    }

    expect(offenders, `RPC résolus dans public mais définis dans app :\n${offenders.join('\n')}`).toEqual([]);
  });
});
