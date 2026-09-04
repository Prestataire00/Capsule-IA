// Une convention groupée n'a de sens que si elle respecte trois règles :
// un document par ENTREPRISE, jamais de particulier dedans, et un cumul des
// montants et des heures — sinon l'entreprise signerait pour un seul salarié
// le prix d'un seul, en croyant engager toute son équipe.
import { describe, it, expect, vi } from 'vitest';

const DOSSIERS = [
  { id: 'd1', company_id: 'c1', total_amount_cents: 100000, total_hours: 14,
    learner: { first_name: 'Léa', last_name: 'Zola', email: 'lea@x.fr', birth_date: null }, company: { name: 'Acme' } },
  { id: 'd2', company_id: 'c1', total_amount_cents: 100000, total_hours: 14,
    learner: { first_name: 'Sam', last_name: 'Abel', email: 'sam@x.fr', birth_date: null }, company: { name: 'Acme' } },
  { id: 'd3', company_id: 'c2', total_amount_cents: 90000, total_hours: 7,
    learner: { first_name: 'Ana', last_name: 'Diaz', email: 'ana@x.fr', birth_date: null }, company: { name: 'Beta' } },
  { id: 'd4', company_id: null, total_amount_cents: 50000, total_hours: 7,
    learner: { first_name: 'Théo', last_name: 'Blanc', email: 'theo@x.fr', birth_date: null }, company: null },
];

vi.mock('@/shared/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    schema: () => ({
      from: (t: string) => ({
        select: () => {
          if (t === 'sessions') {
            return { eq: () => ({ maybeSingle: async () => ({ data: { organization_id: 'o1', dossier_id: null } }) }) };
          }
          if (t === 'session_dossiers') {
            return { eq: async () => ({ data: DOSSIERS.map((d) => ({ dossier_id: d.id })) }) };
          }
          return { eq: () => ({ is: () => ({ in: async () => ({ data: DOSSIERS, error: null }) }) }) };
        },
      }),
    }),
  }),
}));

vi.mock('@/features/documents/build-convention-input', () => ({
  buildConventionInput: async () => ({
    organizationId: 'o1',
    input: {
      organization: { name: 'OF', siret: null, nda: null, address: null, representativeName: null },
      representativeTitle: null, place: null,
      learner: { firstName: 'Léa', lastName: 'Zola', email: 'lea@x.fr', birthDate: null, address: null },
      company: { name: 'Acme', siret: null, address: null },
      funder: null,
      dossier: { totalHours: 14, currency: 'EUR', totalAmountCents: 100000 },
    },
  }),
}));

describe('convention groupée par entreprise', () => {
  it('produit un document par entreprise ayant au moins deux inscrits', async () => {
    const { buildGroupConventions } = await import('@/features/documents/build-group-convention');
    const r = await buildGroupConventions('s1');

    // Acme (2 salariés) seulement. Beta n'en a qu'un, le particulier est écarté.
    expect(r.map((c) => c.companyName)).toEqual(['Acme']);
    expect(r[0]!.dossierIds.sort()).toEqual(['d1', 'd2']);
  });

  it('cumule montants et heures, et liste les participants par ordre alphabétique', async () => {
    const { buildGroupConventions } = await import('@/features/documents/build-group-convention');
    const [c] = await buildGroupConventions('s1');

    expect(c!.input.dossier.totalAmountCents).toBe(200000);
    expect(c!.input.dossier.totalHours).toBe(28);
    expect(c!.input.participants?.map((p) => p.lastName)).toEqual(['Abel', 'Zola']);
  });

  it('n’inclut jamais un particulier dans une convention d’entreprise', async () => {
    const { buildGroupConventions } = await import('@/features/documents/build-group-convention');
    const r = await buildGroupConventions('s1');
    const noms = r.flatMap((c) => c.input.participants?.map((p) => p.lastName) ?? []);
    expect(noms).not.toContain('Blanc');
  });
});
