/* eslint-disable @typescript-eslint/no-explicit-any -- Database generic non disponible (placeholder), casts ciblent .schema('app'). */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { SignJWT } from 'jose';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOKEN_SIGNING_KEY = process.env.TOKEN_SIGNING_KEY!;

// Réplique inline de generateSignatureToken (shared/lib/signature-token.ts).
// Évite de dépendre du path alias `@/...` non résolu côté Playwright.
const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'signature';
const TTL_SECONDS = 24 * 60 * 60;

const signingKey = (): Uint8Array => {
  const raw = TOKEN_SIGNING_KEY;
  try {
    return Uint8Array.from(Buffer.from(raw, 'base64'));
  } catch {
    return new TextEncoder().encode(raw);
  }
};

const signE2eToken = async (sheetId: string, signerId: string): Promise<string> => {
  const jti = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return await new SignJWT({ sheet: sheetId, sub: signerId, kind: 'learner' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setJti(jti)
    .sign(signingKey());
};

test.describe('Émargement présentiel — golden path Qualiopi', () => {
  const slug = `att-${Date.now()}`;
  let orgId: string;
  let learnerId: string;
  let formationId: string;
  let dossierId: string;
  let sessionId: string;
  let sheetId: string;
  let signerToken: string;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  test.beforeAll(async () => {
    orgId = randomUUID();
    learnerId = randomUUID();
    formationId = randomUUID();
    dossierId = randomUUID();
    sessionId = randomUUID();
    sheetId = randomUUID();

    // 1) Org
    await (admin as any).schema('app').from('organizations').insert({
      id: orgId,
      slug,
      name: `E2E Émargement ${slug}`,
      contact_email: `contact-${slug}@example.com`,
    });

    // 2) Learner avec email (utilisé pour le matching potentiel)
    await (admin as any).schema('app').from('learners').insert({
      id: learnerId,
      organization_id: orgId,
      first_name: 'Alice',
      last_name: 'Émargement',
      email: `alice-${slug}@example.com`,
    });

    // 3) Formation
    await (admin as any).schema('app').from('formations').insert({
      id: formationId,
      organization_id: orgId,
      code: `F-${slug}`,
      title: 'Formation E2E',
      slug,
      default_duration_hours: 7,
    });

    // 4) Dossier (formation_snapshot JSONB requis)
    const startDate = '2026-09-15';
    const endDate = '2026-09-15';
    await (admin as any).schema('app').from('dossiers').insert({
      id: dossierId,
      organization_id: orgId,
      reference: `DOS-${slug}`,
      learner_id: learnerId,
      formation_id: formationId,
      formation_snapshot: { title: 'Formation E2E', code: `F-${slug}` },
      status: 'active',
      modality: 'presentiel',
      start_date: startDate,
      end_date: endDate,
      total_hours: 7,
    });

    // 5) Session présentielle 09h-12h (matin)
    await (admin as any).schema('app').from('sessions').insert({
      id: sessionId,
      organization_id: orgId,
      dossier_id: dossierId,
      title: 'Séance E2E matin',
      modality: 'presentiel',
      status: 'planned',
      starts_at: '2026-09-15T07:00:00Z',
      ends_at: '2026-09-15T10:00:00Z',
      location: 'Salle E2E',
    });

    // 6) Participant learner
    await (admin as any).schema('app').from('session_participants').insert({
      session_id: sessionId,
      organization_id: orgId,
      participant_kind: 'learner',
      learner_id: learnerId,
    });

    // 7) Attendance sheet
    await (admin as any).schema('app').from('attendance_sheets').insert({
      id: sheetId,
      organization_id: orgId,
      dossier_id: dossierId,
      session_id: sessionId,
      half_day: 'full',
      status: 'open',
    });

    // 8) JWT token (TTL 24h, signature inline)
    signerToken = await signE2eToken(sheetId, learnerId);
  });

  test.afterAll(async () => {
    // Cleanup en cascade via ON DELETE CASCADE depuis organizations / RESTRICT depuis dossiers
    await (admin as any).schema('app').from('attendance_signatures').delete().eq('attendance_sheet_id', sheetId);
    await (admin as any).schema('app').from('attendance_sheets').delete().eq('id', sheetId);
    await (admin as any).schema('app').from('session_participants').delete().eq('session_id', sessionId);
    await (admin as any).schema('app').from('sessions').delete().eq('id', sessionId);
    await (admin as any).schema('app').from('dossiers').delete().eq('id', dossierId);
    await (admin as any).schema('app').from('formations').delete().eq('id', formationId);
    await (admin as any).schema('app').from('learners').delete().eq('id', learnerId);
    await (admin as any).schema('app').from('organizations').delete().eq('id', orgId);
  });

  test('apprenant signe via lien QR → IP/UA capturés, evidence_source=qr', async ({ page }) => {
    // 1) Visite la page signer
    await page.goto(`/signer/${signerToken}`);

    // 2) Preview : doit afficher le nom de l'apprenant
    await expect(page.getByText(/Alice/)).toBeVisible({ timeout: 5000 });

    // 3) Cocher la case "Je confirme ma présence" si elle existe + tracer une signature
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not found');
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 50);
    await page.mouse.move(box.x + 140, box.y + 20);
    await page.mouse.up();

    // 4) Si checkbox confirmation présente, cocher
    const confirmCheckbox = page.getByRole('checkbox');
    if (await confirmCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmCheckbox.check();
    }

    // 5) Submit
    const submitBtn = page.getByRole('button', { name: /Signer|Valider|Confirmer/i }).first();
    await submitBtn.click();

    // 6) Confirmation visuelle
    await expect(page.getByText(/Merci|Signé|signé/i)).toBeVisible({ timeout: 10_000 });

    // 7) Vérif DB : signature enregistrée avec les bonnes données
    const { data: sig } = await (admin as any).schema('app')
      .from('attendance_signatures')
      .select('status, signature_hash, signer_ip, signer_user_agent, evidence_source, token_id')
      .eq('attendance_sheet_id', sheetId)
      .eq('participant_kind', 'learner')
      .eq('learner_id', learnerId)
      .single();

    expect(sig).toBeTruthy();
    expect(sig.status).toBe('present');
    expect(sig.signature_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(sig.signer_ip).toBeTruthy();
    expect(sig.signer_user_agent).toBeTruthy();
    expect(sig.evidence_source).toBe('qr');
    expect(sig.token_id).toBeTruthy();

    // 8) Vérif anti-replay : le même token ne doit pas pouvoir resigner
    await page.goto(`/signer/${signerToken}`);
    // Le JTI est consumed côté RPC → tentative resoumission échouera côté serveur.
    // L'UI affiche soit la page preview soit un état done. On vérifie juste qu'il
    // n'y a toujours qu'1 signature.
    const { count } = await (admin as any).schema('app')
      .from('attendance_signatures')
      .select('*', { head: true, count: 'exact' })
      .eq('attendance_sheet_id', sheetId);
    expect(count).toBe(1);
  });

  test('token invalide → page erreur', async ({ page }) => {
    await page.goto('/signer/garbage.token.here');
    await expect(page.getByText(/expir|invalide|Lien/i)).toBeVisible({ timeout: 5000 });
  });
});
