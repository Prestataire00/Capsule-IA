// Liens d'invitation et de réinitialisation : échangés côté serveur, jamais le lien brut Supabase.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { authCallbackLink, safeInternalPath } from '@/shared/lib/auth/email-link';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('lien envoyé par e-mail', () => {
  it('passe par /auth/callback avec le jeton haché et la destination', () => {
    const lien = new URL(authCallbackLink('https://capsule.exemple/', 'abc123', 'invite', '/auth/reset-password?next=%2Fformateur'));
    expect(lien.pathname).toBe('/auth/callback');
    expect(lien.searchParams.get('token_hash')).toBe('abc123');
    expect(lien.searchParams.get('type')).toBe('invite');
    expect(lien.searchParams.get('next')).toBe('/auth/reset-password?next=%2Fformateur');
  });

  it('refuse une destination externe', () => {
    expect(new URL(authCallbackLink('https://c.fr', 'h', 'recovery', '//evil.com')).searchParams.get('next')).toBe('/');
    expect(safeInternalPath('https://evil.com')).toBe('/');
    expect(safeInternalPath('/formateur')).toBe('/formateur');
  });

  it('l’invitation formateur et « mot de passe oublié » n’envoient plus le lien brut', () => {
    for (const f of ['../features/trainers/send-trainer-invite.ts', '../app/auth/mot-de-passe-oublie/actions.ts']) {
      const src = lire(f);
      expect(src).not.toContain('action_link');
      expect(src).toContain('hashed_token');
      expect(src).toContain('authCallbackLink(');
    }
  });

  it('l’invitation rattache la fiche au compte invité, depuis la fiche comme à la création', () => {
    expect(lire('../features/trainers/send-trainer-invite.ts')).toContain(".update({ user_id: userId } as never)");
    expect(lire('../app/(dashboard)/formateurs/[id]/profile-actions.ts')).toMatch(/sendTrainerInvite\(\{[\s\S]*?trainerId,\s*\}\)/);
    expect(lire('../app/(dashboard)/formateurs/nouveau/actions.ts')).toMatch(/sendTrainerInvite\(\{[\s\S]*?trainerId,\s*\}\)/);
  });

  it('après le mot de passe, le formateur arrive dans son espace', () => {
    expect(lire('../features/trainers/send-trainer-invite.ts')).toContain("encodeURIComponent('/formateur')");
    expect(lire('../app/auth/reset-password/reset-form.tsx')).toContain('router.replace(next)');
  });
});
