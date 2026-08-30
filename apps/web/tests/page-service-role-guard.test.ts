// Garde-fou anti-régression : une PAGE du dashboard qui interroge la base avec
// `service_role` contourne la RLS. Sans garde de rôle ni filtre d'organisation,
// il suffit alors de taper l'URL pour lire les données d'un autre rôle — voire
// d'un autre organisme.
//
// Failles réelles corrigées le 2026-08-30 :
//   - /dossiers/[id]/facturation : montants, financeurs et factures d'un dossier
//     lisibles par n'importe quel compte connaissant son identifiant ;
//   - /reclamations : toutes les réclamations de TOUS les organismes, avec le
//     nom et l'e-mail des réclamants.
//
// Les tests existants (`api-service-role-guard`) couvraient les routes API et
// les Server Actions, mais PAS les pages : c'est par là que c'est passé.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD = path.resolve(__dirname, '../app/(dashboard)');

/** Marqueurs acceptés comme garde d'accès dans une page. */
const GUARDS = ['requireAccess', 'getCurrentMember', 'canAccessDossier', 'canManageSection'];

/**
 * Pages exemptées : elles utilisent `service_role` mais bornent la lecture au
 * seul utilisateur connecté (`.eq('user_id', user.id)` après `auth.getUser()`),
 * ce qui rend une garde de rôle inutile — un membre gère sa propre intégration.
 */
const EXEMPT = new Set(['agenda', 'parametres/integrations/google-calendar']);

function pages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) pages(p, out);
    else if (entry.name === 'page.tsx') out.push(p);
  }
  return out;
}

describe('pages du dashboard et service_role', () => {
  it('aucune page service_role sans garde de rôle', () => {
    const offenders: string[] = [];

    for (const file of pages(DASHBOARD)) {
      const source = fs.readFileSync(file, 'utf-8');
      const usesServiceRole =
        source.includes('SUPABASE_SERVICE_ROLE_KEY') || source.includes('supabaseAdmin');
      if (!usesServiceRole) continue;

      const route = path.relative(DASHBOARD, path.dirname(file));
      if (EXEMPT.has(route)) continue;

      if (!GUARDS.some((g) => source.includes(g))) offenders.push(`/${route}`);
    }

    expect(offenders, 'pages service_role sans garde de rôle').toEqual([]);
  });
});
