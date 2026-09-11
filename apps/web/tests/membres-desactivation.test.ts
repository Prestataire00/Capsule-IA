// Désactivation d'un membre : contrôles sous RLS, écriture en service role.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/parametres/membres/members-actions.ts');
const bloc = ACTIONS.slice(ACTIONS.indexOf('export const deactivateMemberAction'), ACTIONS.indexOf('export const addMemberAction'));

describe('désactivation d’un membre', () => {
  it('écrit en service role : la politique de lecture (membres actifs) refusait la ligne désactivée', () => {
    expect(bloc).toContain('const admin = supabaseAdmin();');
    expect(bloc).not.toMatch(/ctx\.supabase\s*\.schema\('app'\)\s*\.from\('members'\)\s*\.update/);
  });

  it('garde les contrôles : administrateur, même organisme, dernier propriétaire, propriétaire par un propriétaire, pas soi-même', () => {
    expect(bloc).toContain("if (!isAdminOrOwner(currentRole)) return { ok: false as const, error: 'forbidden' }");
    expect(bloc).toContain(".eq('organization_id', orgId)");
    expect(bloc).toContain("error: 'last_owner'");
    expect(bloc).toContain("error: 'owner_only'");
    expect(bloc).toContain("error: 'self'");
  });

  it('n’annonce un succès que si la ligne est vraiment désactivée', () => {
    expect(bloc).toContain("(apres as { deleted_at: string | null }).deleted_at === null");
  });
});
