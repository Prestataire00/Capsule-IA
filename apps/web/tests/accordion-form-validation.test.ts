// Garde-fou anti-régression : la validation native du navigateur (`type="email"`,
// `type="number"`, `type="date"`, `required`, `pattern`…) refuse de soumettre un
// formulaire contenant un champ invalide, mais ne sait pas ouvrir une section
// d'accordéon fermée pour le montrer. Résultat : le bouton d'envoi ne fait
// RIEN — ni message, ni requête (bug réel du 2026-08-16 sur la création de
// formation). Un formulaire à sections repliables doit donc porter `noValidate`
// et s'en remettre à son schéma zod, qui rouvre la section et nomme le champ.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'tests']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

describe('formulaires à sections repliables', () => {
  it('désactive la validation native du navigateur (noValidate)', () => {
    const offenders = walk(WEB_ROOT).filter((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      if (!source.includes('AccordionSection')) return false;
      if (!source.includes('<form')) return false;
      return !source.includes('noValidate');
    });

    expect(
      offenders.map((f) => path.relative(WEB_ROOT, f)),
      'formulaires à accordéon dont la validation navigateur peut bloquer un envoi sans message',
    ).toEqual([]);
  });
});
