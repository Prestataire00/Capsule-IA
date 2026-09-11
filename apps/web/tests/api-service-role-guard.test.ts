// Garde-fou anti-régression : le middleware laisse passer tout `/api` sans
// session (`path.startsWith('/api')` → isPublic). Une route qui utilise
// `service_role` contourne aussi la RLS : sans garde explicite dans le handler,
// elle est ouverte à un appelant anonyme sur toutes les organisations.
// Bugs réels corrigés le 2026-08-16 : /api/factures/export.csv (export complet
// sans authentification) et /api/invoices/[id]/facture.pdf (PDF sur simple UUID).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../app/api');

/** Routes légitimement ouvertes : leur garde ne repose pas sur la session. */
const EXEMPT = new Set([
  'health', // sonde publique, ne lit aucune donnée métier
  'cron/dispatch-events', // CRON_SECRET
  'cron/transactional-emails', // CRON_SECRET
  'cron/zoom-sync', // CRON_SECRET
  'webhooks/resend', // signature du webhook
  'integrations/google-calendar/callback', // state OAuth signé
  'integrations/google-calendar/connect', // state OAuth signé
]);

/** Marqueurs acceptés comme garde d'accès dans un handler. */
const GUARDS = [
  // Motif maison : la ligne visée est d'abord lue via le client RLS, `service_role`
  // ne sert ensuite qu'à signer une URL Storage (cf. /api/documents/[id]).
  'supabaseServer',
  'getCurrentMember',
  'requireAccess',
  'canAccessDossier',
  'auth.getUser',
  'CRON_SECRET',
  'verifyState',
  'verifyApprenantToken',
  'verifyQuestionnaireToken',
  'verifySignatureToken',
  // Émargement : utilisateur connecté + feuille ou séance lue sous RLS.
  'accessibleSheet',
  'accessibleSession',
];

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(p, out);
    else if (entry.name === 'route.ts') out.push(p);
  }
  return out;
}

describe('routes API et service_role', () => {
  it('aucune route service_role sans garde explicite', () => {
    const offenders: string[] = [];

    for (const file of routeFiles(API_ROOT)) {
      const source = fs.readFileSync(file, 'utf-8');
      const usesServiceRole =
        source.includes('SUPABASE_SERVICE_ROLE_KEY') || source.includes('supabaseAdmin');
      if (!usesServiceRole) continue;

      const route = path.relative(API_ROOT, path.dirname(file));
      if (EXEMPT.has(route)) continue;
      // Une route sous /espace/[token] ou /signer/[token] est gardée par son token.
      if (route.includes('[token]')) continue;

      if (!GUARDS.some((g) => source.includes(g))) offenders.push(`/api/${route}`);
    }

    expect(offenders, `routes service_role sans garde :\n${offenders.join('\n')}`).toEqual([]);
  });

  it('aucune Server Action du dashboard en service_role sans garde', () => {
    // Une Server Action est un endpoint POST appelable par quiconque connaît son
    // identifiant : masquer le bouton ne protège rien, et `service_role` contourne
    // la RLS. Bugs réels corrigés le 2026-08-16 (startTraining/closeDossier sur
    // n'importe quel dossier, création d'entreprise sur le mauvais organisme…).
    const DASHBOARD = path.resolve(__dirname, '../app/(dashboard)');
    const ACTION_GUARDS = [
      'guardAction',
      'guardRowAction',
      'authActionClient',
      'getCurrentMember',
      'requireAccess',
      'canManageSection',
      'assertSessionAccess',
      'canAccessDossier',
      'auth.getUser',
      'accessibleSheet',
      'accessibleSession',
    ];

    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else if (entry.name.endsWith('.ts')) out.push(p);
      }
      return out;
    };

    const offenders = walk(DASHBOARD).filter((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      if (!/^'use server'/m.test(source)) return false;
      if (!source.includes('SUPABASE_SERVICE_ROLE_KEY') && !source.includes('supabaseAdmin')) return false;
      return !ACTION_GUARDS.some((g) => source.includes(g));
    });

    expect(
      offenders.map((f) => path.relative(DASHBOARD, f)),
      'Server Actions service_role sans garde de session',
    ).toEqual([]);
  });
});
