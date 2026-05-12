import { test, expect } from '@playwright/test';

const CRON_SECRET = process.env.CRON_SECRET;

test.describe('/api/cron/zoom-sync — protection auth', () => {
  test('POST sans Authorization → 401', async ({ request }) => {
    const resp = await request.post('/api/cron/zoom-sync', { failOnStatusCode: false });
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
  });

  test('POST avec Authorization invalide → 401', async ({ request }) => {
    const resp = await request.post('/api/cron/zoom-sync', {
      headers: { Authorization: 'Bearer not-the-real-secret' },
      failOnStatusCode: false,
    });
    expect(resp.status()).toBe(401);
  });

  test('GET sans Authorization → 401 (alias)', async ({ request }) => {
    const resp = await request.get('/api/cron/zoom-sync', { failOnStatusCode: false });
    expect(resp.status()).toBe(401);
  });

  test('POST avec bon Authorization → 200 ou 503 selon ZOOM_SECRETS_KEY', async ({ request }) => {
    test.skip(!CRON_SECRET, 'CRON_SECRET non disponible dans l\'env de test');
    const resp = await request.post('/api/cron/zoom-sync', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      failOnStatusCode: false,
    });
    // Si ZOOM_SECRETS_KEY pas set : 503. Sinon : 200 avec processed N (peut être 0).
    expect([200, 503]).toContain(resp.status());
    const body = await resp.json();
    if (resp.status() === 200) {
      expect(body.ok).toBe(true);
      expect(typeof body.processed).toBe('number');
      expect(body.summary).toBeDefined();
    } else {
      expect(body.error).toBe('zoom_secrets_key_missing');
    }
  });
});
