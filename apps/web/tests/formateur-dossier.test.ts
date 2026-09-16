// Dossier confié à un formateur : il le gère depuis son espace, sans jamais
// voir la partie financière.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

/**
 * Code seul, commentaires retirés : la documentation de ces fichiers cite
 * précisément les colonnes financières pour dire qu'on ne les lit pas, et une
 * recherche naïve confondrait la prose avec une requête.
 */
const codeSeul = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

const MOTS_ARGENT = [
  'total_amount_cents',
  'price_cents',
  'amount_cents',
  'hourly_rate_cents',
  'dossier_funders',
  "from('quotes')",
  "from('invoices')",
  "from('payments')",
  'formation_expenses',
];

describe('lecture du dossier par le formateur', () => {
  const src = lire('../features/trainer-space/my-dossiers.ts');

  it('n’interroge aucune colonne ni table financière', () => {
    const code = codeSeul(src);
    for (const mot of MOTS_ARGENT) expect(code, mot).not.toContain(mot);
  });

  it('énumère les colonnes du dossier plutôt que de tout prendre', () => {
    expect(src).toContain('const COLONNES_DOSSIER =');
    expect(src).not.toContain(".select('*')");
  });

  it('lit sous RLS, sans service role', () => {
    expect(src).toContain('supabaseServer');
    expect(src).not.toContain('supabaseAdmin');
  });

  it('vérifie que le dossier est bien confié au formateur connecté', () => {
    expect(src).toContain('hasTrainerSpace');
    expect(src).toContain("rpc('my_trainer_dossier_ids' as never)");
    expect(src).toContain('.includes(dossierId)');
  });

  it('écarte les participants retirés d’une séance', () => {
    expect(src).toContain("p.source !== 'manual_remove'");
  });
});

describe('écrans de l’espace formateur', () => {
  const liste = lire('../app/(formateur)/mes-dossiers/page.tsx');
  const detail = lire('../app/(formateur)/mes-dossiers/[id]/page.tsx');

  it('la garde précède toute lecture du détail', () => {
    expect(detail).toContain('requireMyTrainerDossier(params.id)');
    // L'ordre qui compte est celui des appels, pas celui des imports.
    expect(detail.indexOf('requireMyTrainerDossier(params.id)')).toBeLessThan(detail.indexOf('loadMyDossier(acces.sb'));
    expect(detail).toContain('if (!acces.ok) notFound();');
  });

  it('n’affiche aucun montant', () => {
    for (const src of [liste, detail]) {
      const code = codeSeul(src);
      for (const mot of MOTS_ARGENT) expect(code, mot).not.toContain(mot);
      expect(code).not.toMatch(/€/);
    }
  });

  it('donne au formateur ce qui sert son travail : client, référent, apprenants, séances, émargement', () => {
    expect(detail).toContain('Client');
    expect(detail).toContain('Votre interlocuteur chez le client.');
    expect(detail).toContain('Apprenants');
    expect(detail).toContain('Séances');
    expect(detail).toContain('/emarger/${s.id}');
  });

  it('dit explicitement ce qui lui reste fermé', () => {
    expect(detail).toContain('ne sont pas accessibles depuis votre espace');
  });
});

describe('confier un dossier (côté organisme)', () => {
  const actions = lire('../app/(dashboard)/dossiers/[id]/formateurs/actions.ts');
  const page = lire('../app/(dashboard)/dossiers/[id]/formateurs/page.tsx');

  it('réservé aux rôles qui gèrent les dossiers', () => {
    expect(actions).toContain('getCurrentMember');
    expect(actions).toContain("can(membre.role, 'dossiers') !== 'manage'");
  });

  it('vérifie que dossier et formateur sont de l’organisation du membre', () => {
    expect(actions.match(/\.eq\('organization_id', membre\.organizationId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('le premier formateur rattaché devient référent pédagogique', () => {
    expect(actions).toContain('is_lead: (count ?? 0) === 0');
  });

  it('explique la panne d’audit connue au lieu d’un message opaque', () => {
    expect(actions).toContain('has no field "id"');
    expect(actions).toContain('migration 0168');
  });

  it('les boutons ne s’affichent qu’aux gestionnaires', () => {
    expect(page).toContain("canManageSection('dossiers')");
    expect(page).toContain('{gerer &&');
  });
});

// Règle posée par Ismael le 16/09/2026 : un inscrit est un apprenant, et le
// dossier reste au nom du référent désigné chez le client.
describe('titulaire du dossier', () => {
  const actions = lire('../app/(dashboard)/dossiers/[id]/apprenants/actions.ts');
  const page = lire('../app/(dashboard)/dossiers/[id]/apprenants/page.tsx');

  it('inscrire un stagiaire ne le promeut pas titulaire', () => {
    expect(codeSeul(actions)).not.toMatch(/update\(\{ learner_id/);
  });

  it('l’écran dit que le dossier est au nom du référent', () => {
    expect(page).toContain('au nom du');
    expect(page).toContain('référent désigné chez le client');
    expect(page).not.toContain('prendra sa place');
  });
});
