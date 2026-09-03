// Garde-fou anti-régression : la garde d'autorisation centrale lit le rôle dans
// le jeton de session. Deux erreurs y sont possibles, et les deux verrouillent
// la plateforme entière sans le moindre message.
//
// Panne réelle du 2026-08-30 → 2026-09-03 (CAP-23) : la garde lisait le claim
// `role`. Or `role` est réservé par PostgREST — il pilote le `SET ROLE` et vaut
// toujours `authenticated` pour un utilisateur connecté. Le rôle applicatif vit
// sous `user_role` depuis la migration 0091, précisément pour éviter cette
// collision. Résultat : `can('authenticated', …)` renvoyait `'none'` pour toutes
// les sections, et chaque clic renvoyait l'utilisateur à l'accueil.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { can, roleConnu } from '@/shared/lib/auth/permissions';

const MIDDLEWARE = path.resolve(__dirname, '../shared/lib/supabase/middleware.ts');

describe('lecture du rôle par la garde centrale', () => {
  it('le middleware lit `user_role`, pas le claim réservé `role`', () => {
    const source = fs.readFileSync(MIDDLEWARE, 'utf-8');
    const decodeur = source.slice(source.indexOf('function decodeClaims'), source.indexOf('// Redirection'));

    expect(decodeur, 'le rôle métier vient du claim `user_role` (migration 0091)').toContain('user_role');
    expect(
      /\bp\.role\b/.test(decodeur),
      'lire `p.role` renvoie « authenticated » et refuse toutes les sections',
    ).toBe(false);
  });

  it('un refus exige un rôle connu de la matrice', () => {
    const source = fs.readFileSync(MIDDLEWARE, 'utf-8');
    expect(source, 'sans ce garde-fou, un claim inattendu verrouille toute la plateforme').toContain(
      'roleConnu(role) && can(role, section)',
    );
  });

  it('« authenticated » n’est pas un rôle connu et ne déclenche donc aucun refus', () => {
    // `can` renvoie bien 'none' — c'est le bon défaut pour accorder un accès.
    expect(can('authenticated', 'crm')).toBe('none');
    // …mais il ne doit jamais suffire à refuser.
    expect(roleConnu('authenticated')).toBe(false);
    expect(roleConnu(undefined)).toBe(false);
    expect(roleConnu('owner')).toBe(true);
  });

  it('les rôles réels restent cloisonnés', () => {
    expect(roleConnu('comptable')).toBe(true);
    expect(can('comptable', 'crm')).toBe('none');
    expect(can('owner', 'crm')).not.toBe('none');
  });
});
