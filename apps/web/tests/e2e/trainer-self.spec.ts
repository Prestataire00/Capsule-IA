/* eslint-disable @typescript-eslint/no-explicit-any -- Database generic non disponible (shared/types/database.ts est un placeholder) ; les casts ciblent l'overload .schema('app') de supabase-js. */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('Espace formateur — Foundation', () => {
  const email = `e2e-${Date.now()}@example.com`;
  let userId: string;
  let org1Id: string;
  let org2Id: string;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  test.beforeAll(async () => {
    // 1) Seed 2 OFs
    org1Id = randomUUID();
    org2Id = randomUUID();
    await (admin as any).schema('app').from('organizations').insert([
      { id: org1Id, name: 'E2E OF Alpha', slug: `alpha-${Date.now()}`, contact_email: 'a@example.com' },
      { id: org2Id, name: 'E2E OF Beta',  slug: `beta-${Date.now()}`,  contact_email: 'b@example.com' },
    ]);

    // 2) Créer le user via admin (avant les fiches trainers, sinon autolink ne fait rien)
    const { data, error } = await admin.auth.admin.createUser({
      email, password: 'E2E-Pass-1234!', email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    // 3) Seed 2 fiches trainers — le trigger autolink doit linker user_id automatiquement
    await (admin as any).schema('app').from('trainers').insert([
      { organization_id: org1Id, first_name: 'E2E', last_name: 'User', email, is_internal: false },
      { organization_id: org2Id, first_name: 'E2E', last_name: 'User', email, is_internal: false },
    ]);
  });

  test.afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
    await (admin as any).schema('app').from('organizations').delete().in('id', [org1Id, org2Id]);
  });

  test('golden path multi-OF', async ({ page }) => {
    // 1) Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill('E2E-Pass-1234!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    // 2) Dashboard formateur — hero + 2 OFs visibles
    await page.goto('/formateur');
    await expect(page.getByText(/Bonjour E2E/)).toBeVisible();
    await expect(page.getByText(/2 organismes/)).toBeVisible();

    // 3) OfSwitcher montre les 2 OFs
    await page.getByRole('button', { name: /Tous mes OF|E2E OF/ }).first().click();
    await expect(page.getByText('E2E OF Alpha')).toBeVisible();
    await expect(page.getByText('E2E OF Beta')).toBeVisible();
    // Close popover
    await page.keyboard.press('Escape');

    // 4) Page Profil — modifier bio
    await page.goto('/profil');
    await page.getByLabel(/^bio$/i).fill('Bio E2E auto-test');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    await expect(page.getByText(/Enregistré/)).toBeVisible({ timeout: 5000 });

    // 5) Page CV — ajouter une compétence
    await page.goto('/cv');
    await page.getByRole('button', { name: /ajouter/i }).first().click();
    await page.getByLabel(/^titre$/i).fill('Master MEEF — E2E');
    // Bouton primaire du modal (le 2e "Ajouter" — celui-ci dans la dialog)
    await page.getByRole('button', { name: /^ajouter$/i }).last().click();
    await expect(page.getByText('Master MEEF — E2E')).toBeVisible({ timeout: 5000 });

    // 6) Dupliquer vers l'autre OF via le menu MoreHorizontal
    await page.locator('[data-testid="competency-menu-button"]').first().click();
    await page.getByText(/Dupliquer vers mes autres OF/).click();

    // 7) Vérifier via service_role : la compétence existe dans les 2 OFs maintenant
    // (1 row par trainer, 2 trainers du même user → 2 rows)
    await page.waitForTimeout(500); // laisser le revalidatePath se propager
    const { data: comps } = await (admin as any).schema('app')
      .from('trainer_competencies')
      .select('id, trainer_id, title')
      .eq('title', 'Master MEEF — E2E');
    expect(comps).toHaveLength(2);
  });
});
