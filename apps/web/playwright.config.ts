import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import refuserProduction from './tests/e2e/refuse-production';

/**
 * Configuration Playwright — elle manquait.
 *
 * `pnpm test:e2e` lançait `playwright test` sans configuration : Playwright
 * balayait alors tout le dépôt, tombait sur les fichiers Vitest, et terminait
 * sur « Total: 0 tests in 0 files ». Les trois specs de `tests/e2e/` n'avaient
 * donc jamais été exécutées, alors que la commande figure dans CLAUDE.md
 * (audit CAP-21).
 */

/**
 * Playwright ne charge pas `.env.local` : sans ça, les specs cassent dès leur
 * chargement, `createClient` recevant une URL vide.
 */
function chargerEnv(fichier: string): void {
  const chemin = path.resolve(__dirname, fichier);
  if (!fs.existsSync(chemin)) return;
  for (const ligne of fs.readFileSync(chemin, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);
    if (!m) continue;
    const [, cle, brut] = m;
    if (process.env[cle!] === undefined) process.env[cle!] = brut!.trim().replace(/^["']|["']$/g, '');
  }
}

chargerEnv('.env.test.local');
chargerEnv('.env.local');

// Le refus est appliqué ici, et pas seulement dans `globalSetup` : Playwright
// exécute la portée module des specs dès la collecte (`--list`), donc avant
// `globalSetup`. Les specs sèment via le service role — une exécution contre la
// production y créerait de vraies organisations et de vrais utilisateurs.
refuserProduction();

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/refuse-production',
  fullyParallel: false, // les specs sèment des organisations : on évite les collisions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
