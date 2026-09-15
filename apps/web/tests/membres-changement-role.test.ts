// Changer le rôle d'un membre affichait « Échec de la mise à jour. » sans motif
// (signalé le 2026-09-15). Deux causes : le sélecteur proposait « Propriétaire »
// alors que `members_update` refuse d'en nommer un second (WITH CHECK :
// `role <> 'owner' OR user_id = auth.uid()`), et l'action RELANÇAIT l'erreur —
// `res.data` devenait indéfini et l'écran retombait sur son message générique.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/parametres/membres/members-actions.ts');
const UI = lire('../app/(dashboard)/parametres/membres/member-row-actions.tsx');
const bloc = ACTIONS.slice(
  ACTIONS.indexOf('export const changeMemberRoleAction'),
  ACTIONS.indexOf('export const setMemberPasswordAction'),
);

describe('changement de rôle d’un membre', () => {
  it('ne relance plus l’erreur : le motif revient à l’écran', () => {
    expect(bloc).not.toContain('throw new Error(`change_role_failed');
    expect(bloc).toContain("error: 'update_failed', details: error.message");
  });

  it('énonce les règles refusées par la base plutôt que de les y découvrir', () => {
    expect(bloc).toContain("error: 'owner_only'");
    expect(bloc).toContain("error: 'owner_grant'");
    expect(bloc).toContain("error: 'last_owner'");
  });

  it('écrit en service role, dans son organisme, sur un membre actif', () => {
    expect(bloc).toContain('const admin = supabaseAdmin();');
    expect(bloc).not.toMatch(/ctx\.supabase\s*\.schema\('app'\)\s*\.from\('members'\)\s*\.update/);
    expect(bloc).toContain(".eq('organization_id', orgId)");
    expect(bloc).toContain(".is('deleted_at', null)");
  });

  it('n’annonce un succès que si la ligne porte vraiment le nouveau rôle', () => {
    expect(bloc).toContain("(apres as { role: string } | null)?.role !== parsedInput.role");
  });

  it('l’écran sait nommer les deux refus liés au propriétaire', () => {
    expect(UI).toContain('owner_only:');
    expect(UI).toContain('owner_grant:');
    expect(UI).toContain('Échec de la mise à jour : ${d.details}');
  });

  it('le sélecteur n’offre « Propriétaire » que sur la ligne du propriétaire', () => {
    expect(UI).toContain("MEMBER_ROLES.filter((r) => r !== 'owner' || props.role === 'owner')");
  });
});

// Le rôle `owner` ne s'atteint que par un transfert explicite : le propriétaire
// désigne son successeur et passe lui-même administrateur (demande Ismael,
// 2026-09-15 — Faouzi Fiévé devient propriétaire).
const transfert = ACTIONS.slice(
  ACTIONS.indexOf('export const transferOwnershipAction'),
  ACTIONS.indexOf('export const setMemberPasswordAction'),
);

describe('transfert de propriété', () => {
  it('réservé au propriétaire en exercice, et jamais vers soi-même', () => {
    expect(transfert).toContain("if (currentRole !== 'owner') return { ok: false as const, error: 'owner_only' }");
    expect(transfert).toContain("if (target.user_id === ctx.userId) return { ok: false as const, error: 'self' }");
  });

  it('nomme AVANT de se retirer : un échec laisse deux propriétaires, jamais zéro', () => {
    const nomination = transfert.indexOf("update({ role: 'owner' }");
    const retrait = transfert.indexOf("update({ role: 'admin' }");
    expect(nomination).toBeGreaterThan(-1);
    expect(retrait).toBeGreaterThan(nomination);
  });

  it('vérifie qu’il reste exactement un propriétaire, et que c’est le nouveau', () => {
    expect(transfert).toContain("owners.length !== 1 || owners[0]?.id !== target.id");
  });

  it('l’écran n’offre le transfert qu’au propriétaire, sur une autre ligne', () => {
    const PAGE = lire('../app/(dashboard)/parametres/membres/page.tsx');
    expect(PAGE).toContain("canTransfer: isOwner && m.role !== 'owner' && m.user_id !== currentUserId");
    expect(UI).toContain('props.canTransfer && (');
  });
});
