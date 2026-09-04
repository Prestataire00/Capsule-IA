// Le récap aux entreprises ne vaut que s'il respecte deux règles :
// un envoi PAR entreprise cliente, et jamais d'envoi pour un particulier —
// qui n'a pas de responsable à informer et reçoit sa convocation en direct.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const envois: { to: string; subject: string }[] = [];

vi.mock('@/shared/lib/email/resend', () => ({
  sendEmail: async (i: { to: string; subject: string }) => {
    envois.push(i);
    return { ok: true, id: 'x' };
  },
}));

const DOSSIERS = [
  { id: 'd1', company_id: 'c1', learner: { first_name: 'Léa', last_name: 'Martin', email: 'lea@x.fr' },
    formation: { title: 'Compta' }, company: { name: 'Acme', contact_name: 'Paul', contact_email: 'paul@acme.fr' } },
  { id: 'd2', company_id: 'c1', learner: { first_name: 'Sam', last_name: 'Roux', email: 'sam@x.fr' },
    formation: { title: 'Compta' }, company: { name: 'Acme', contact_name: 'Paul', contact_email: 'paul@acme.fr' } },
  { id: 'd3', company_id: 'c2', learner: { first_name: 'Ana', last_name: 'Diaz', email: 'ana@x.fr' },
    formation: { title: 'Compta' }, company: { name: 'Beta', contact_name: null, contact_email: 'rh@beta.fr' } },
  { id: 'd4', company_id: null, learner: { first_name: 'Théo', last_name: 'Blanc', email: 'theo@x.fr' },
    formation: { title: 'Compta' }, company: null },
];

vi.mock('@/shared/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    schema: () => ({
      from: (table: string) => ({
        select: () => {
          if (table === 'sessions') {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 's1', organization_id: 'o1', starts_at: '2026-10-05T09:00:00Z',
                    ends_at: '2026-10-05T17:00:00Z', modality: 'presentiel',
                    location: 'Paris', remote_url: null, dossier_id: null,
                  },
                  error: null,
                }),
              }),
            };
          }
          if (table === 'session_dossiers') {
            return { eq: async () => ({ data: DOSSIERS.map((d) => ({ dossier_id: d.id })), error: null }) };
          }
          return {
            eq: () => ({ is: () => ({ in: async () => ({ data: DOSSIERS, error: null }) }) }),
          };
        },
      }),
    }),
  }),
}));

describe('récap des convocations aux entreprises', () => {
  beforeEach(() => {
    envois.length = 0;
  });

  it('envoie un e-mail par entreprise, et aucun pour le particulier', async () => {
    const { sendConvocationsRecap } = await import('@/features/sessions/send-convocations-recap');
    const r = await sendConvocationsRecap('s1');

    expect(r.entreprises).toBe(2);
    expect(r.envoyes).toBe(2);
    expect(envois.map((e) => e.to).sort()).toEqual(['paul@acme.fr', 'rh@beta.fr']);
    // Théo, particulier, ne déclenche aucun envoi entreprise.
    expect(envois.some((e) => e.to === 'theo@x.fr')).toBe(false);
  });

  it('l’objet nomme l’entreprise concernée', async () => {
    const { sendConvocationsRecap } = await import('@/features/sessions/send-convocations-recap');
    await sendConvocationsRecap('s1');
    expect(envois.find((e) => e.to === 'paul@acme.fr')?.subject).toContain('Acme');
  });
});
