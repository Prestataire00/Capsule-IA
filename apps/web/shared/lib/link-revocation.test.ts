// La révocation est du contrôle d'accès : sa logique de comparaison doit être
// tenue par des tests, pas seulement par la relecture (audit CAP-14).
import { describe, it, expect, vi, beforeEach } from 'vitest';

let revokedAtRenvoye: string | null = null;
let erreur: { message: string } | null = null;

vi.mock('@/shared/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              erreur ? { data: null, error: erreur } : { data: revokedAtRenvoye ? { revoked_at: revokedAtRenvoye } : null, error: null },
          }),
        }),
      }),
    }),
  }),
}));

const DOSSIER = () => `dossier-${Math.random()}`; // une entrée de cache neuve à chaque cas

describe('révocation des liens', () => {
  beforeEach(() => {
    revokedAtRenvoye = null;
    erreur = null;
  });

  it('laisse passer un dossier sans révocation', async () => {
    const { isLinkRevoked } = await import('./link-revocation');
    expect(await isLinkRevoked(DOSSIER(), Math.floor(Date.now() / 1000))).toBe(false);
  });

  it('refuse un jeton émis avant la révocation', async () => {
    revokedAtRenvoye = new Date('2026-08-30T12:00:00Z').toISOString();
    const { isLinkRevoked } = await import('./link-revocation');
    const emisAvant = Math.floor(Date.parse('2026-08-30T11:00:00Z') / 1000);
    expect(await isLinkRevoked(DOSSIER(), emisAvant)).toBe(true);
  });

  it('laisse passer un lien réémis après la révocation', async () => {
    revokedAtRenvoye = new Date('2026-08-30T12:00:00Z').toISOString();
    const { isLinkRevoked } = await import('./link-revocation');
    const emisApres = Math.floor(Date.parse('2026-08-30T13:00:00Z') / 1000);
    expect(await isLinkRevoked(DOSSIER(), emisApres)).toBe(false);
  });

  it('refuse un jeton sans horodatage face à un dossier révoqué', async () => {
    // Les jetons émis avant la mise en place de la révocation n'ont pas de `iat` :
    // ils sont nécessairement antérieurs à toute date butoir.
    revokedAtRenvoye = new Date('2026-08-30T12:00:00Z').toISOString();
    const { isLinkRevoked } = await import('./link-revocation');
    expect(await isLinkRevoked(DOSSIER(), undefined)).toBe(true);
  });

  it('laisse passer si la base est injoignable', async () => {
    // Défaut ouvert assumé : la page qui suit ne peut de toute façon rien charger.
    erreur = { message: 'relation « link_revocations » inexistante' };
    const { isLinkRevoked } = await import('./link-revocation');
    expect(await isLinkRevoked(DOSSIER(), Math.floor(Date.now() / 1000))).toBe(false);
  });

  it('ne bloque rien quand le jeton ne porte pas de dossier', async () => {
    const { isLinkRevoked } = await import('./link-revocation');
    expect(await isLinkRevoked(null, Math.floor(Date.now() / 1000))).toBe(false);
  });
});
