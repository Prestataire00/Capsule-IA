// Connexion : un clic produit toujours un effet visible, et un formateur relié par son e-mail entre.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('page de connexion', () => {
  it('lit les champs à l’envoi : le remplissage automatique ne bloque plus le bouton', () => {
    const form = lire('../app/(auth)/login/login-form.tsx');
    expect(form).toContain('new FormData(e.currentTarget)');
    expect(form).toContain('disabled={pending}');
    expect(form).not.toContain('email.length === 0');
  });

  it('explique un refus « aucun accès » au lieu de sembler ne rien faire', () => {
    const page = lire('../app/(auth)/login/page.tsx');
    expect(page).toContain("searchParams.motif === 'aucun-acces'");
    expect(page).toContain('role="alert"');
  });
});

describe('aiguillage du formateur', () => {
  it('relie la fiche portant l’e-mail du compte, même liée à un ancien compte — adresse confirmée seulement', () => {
    const landing = lire('../shared/lib/auth/landing.ts');
    expect(landing).toContain(".eq('email', email)");
    expect(landing).toContain('email_confirmed_at');
    expect(landing).toContain(".is('deleted_at', null)");
    expect(landing).not.toContain(".is('user_id', null)");
  });
});
