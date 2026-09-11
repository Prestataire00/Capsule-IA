// Fiche session façon RFC : onglet Informations, statut modifiable, capacité (0155).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('onglet Informations', () => {
  const page = lire('../app/(dashboard)/sessions/[id]/page.tsx');

  it('présente les champs de RFC', () => {
    for (const l of ['Dates & horaires', 'Formateur', 'Lieu', 'Capacité', 'Tarif / participant', 'CA prévisionnel', 'Coût formateur', 'Devis associé']) {
      expect(page).toContain(l);
    }
  });

  it('calcule le coût formateur depuis son tarif, pas à la main', () => {
    expect(page).toContain('ligneSeance(');
  });

  it('CA prévisionnel : devis envoyés ou signés, sinon tarif × participants non couverts', () => {
    expect(page).toContain("d.status === 'sent' || d.status === 'signed'");
    expect(page).toContain('(n - couverts.length) * Number(tarif ?? 0)');
  });
});

describe('modification de la séance', () => {
  const actions = lire('../app/(dashboard)/sessions/[id]/informations-actions.ts');

  it('réservée aux rôles qui gèrent les dossiers, séance de l’organisme du membre', () => {
    expect(actions).toContain("can(membre.role, 'dossiers') !== 'manage'");
    expect(actions).toContain('s.organization_id !== membre.organizationId');
    expect(actions).toContain(".eq('organization_id', g.organizationId)");
  });

  it('capacité bornée en base', () => {
    expect(lire('../../../supabase/migrations/0155_session_capacite.sql')).toContain('CHECK (capacity_max IS NULL OR capacity_max BETWEEN 1 AND 1000)');
  });
});
