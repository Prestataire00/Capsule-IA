// Séance planifiée pour un client, sans formation ni dossier (0161).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('migration 0161', () => {
  const sql = lire('../../../supabase/migrations/0161_session_client.sql');

  it('ajoute le client sans le rendre obligatoire, et survit à sa suppression', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL');
    // La colonne elle-même reste facultative (l'index partiel, lui, filtre sur IS NOT NULL).
    const definition = sql.split('\n').find((l) => l.includes('ADD COLUMN IF NOT EXISTS company_id')) ?? '';
    expect(definition).not.toMatch(/\bNOT NULL\b/);
  });
});

describe('création d’une séance libre', () => {
  const actions = lire('../app/(dashboard)/sessions/nouvelle/free-session-actions.ts');

  it('réservée aux rôles qui gèrent les dossiers', () => {
    expect(actions).toContain('getCurrentMember');
    expect(actions).toContain("can(membre.role, 'dossiers') !== 'manage'");
  });

  it('vérifie que client, participants et formateur sont de l’organisation', () => {
    expect(actions).toContain("appartiennent('companies'");
    expect(actions).toContain("appartiennent('learners'");
    expect(actions).toContain("appartiennent('trainers'");
    expect(actions).toContain(".eq('organization_id', organizationId)");
  });

  it('crée la séance sans formation ni dossier', () => {
    expect(actions).toContain('dossier_id: null');
    expect(actions).toContain('formation_id: null');
    expect(actions).toContain('company_id: v.companyId || null');
  });

  it('inscrit les participants à la main — seule source d’émargement sans dossier', () => {
    expect(actions).toContain("participant_kind: 'learner'");
    // `participant_source` est une énumération : 'derived', 'manual_add',
    // 'manual_remove'. Un 'manual' était refusé par la base, en silence.
    expect(actions).toContain("source: 'manual_add'");
    expect(actions).not.toMatch(/source: 'manual'/);
  });

  it('refuse une fin antérieure au début', () => {
    expect(actions).toContain('new Date(v.endsAt) > new Date(v.startsAt)');
  });

  it('ne crée un Meet qu’en distanciel ou hybride, et seulement si l’agenda est connecté', () => {
    expect(actions).toContain('REMOTE.has(v.modality)');
    expect(actions).toContain('loadGoogleCredsForUser');
  });
});

describe('affichage d’une séance sans dossier', () => {
  const load = lire('../features/sessions/load-session.ts');

  it('remonte les participants inscrits à la main, sans doublon ni retirés', () => {
    expect(load).toContain("p.source !== 'manual_remove'");
    expect(load).toContain('!dejaVus.has(p.learner_id)');
    expect(load).toContain('directLearners');
  });

  it('la lecture du client ne casse pas une base sans la migration 0161', () => {
    expect(load).toContain('if (!clientErr)');
  });

  it('les participants directs comptent dans le total attendu d’une feuille', () => {
    expect(load).toContain('total: learners.length + directLearners.length');
  });

  it('l’onglet Participants et l’en-tête les affichent', () => {
    expect(lire('../app/(dashboard)/sessions/[id]/apprenants/page.tsx')).toContain('directLearners.length > 0');
    expect(lire('../app/(dashboard)/sessions/[id]/layout.tsx')).toContain(
      'const participants = learners.length + directLearners.length',
    );
  });
});

describe('page de planification', () => {
  const page = lire('../app/(dashboard)/sessions/nouvelle/page.tsx');

  it('propose les deux modes', () => {
    expect(page).toContain('Depuis une formation');
    expect(page).toContain('Séance libre (client)');
    expect(page).toContain('FreeSessionForm');
  });

  it('sans formation au catalogue, la séance libre reste possible', () => {
    expect(page).toContain('séance libre pour un client');
  });
});
