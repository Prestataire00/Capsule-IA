// La convocation aux entreprises ne vaut que si elle respecte ses règles :
// un envoi PAR entreprise cliente, jamais pour un particulier — qui reçoit sa
// convocation en direct —, la liste des PARTICIPANTS de la séance (celle du
// groupe), le référent du dossier avant le contact générique, et le PDF joint.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const envois: { to: string; subject: string; html: string; attachments?: { filename: string }[] }[] = [];

vi.mock('server-only', () => ({}));

vi.mock('@/shared/lib/email/resend', () => ({
  sendEmail: async (i: { to: string; subject: string; html: string; attachments?: { filename: string }[] }) => {
    envois.push(i);
    return { ok: true, id: 'x' };
  },
}));

const SEANCE = {
  id: 's1',
  organizationId: 'o1',
  titre: null,
  debut: '2026-10-08T07:00:00Z',
  fin: '2026-10-08T10:30:00Z',
  dureeHeures: 3.5,
  modalite: 'presentiel',
  lieu: 'Paris',
  visio: null,
  formation: 'Compta',
  groupe: 'Groupe A',
  formateur: null,
  dossierIds: ['d1', 'd3'],
};

// Les participants de la séance : Sam, du même dossier Acme mais d'un autre
// groupe, n'y est pas.
const PARTICIPANTS = [
  { id: 'l1', prenom: 'Léa', nom: 'Martin', email: 'lea@x.fr', companyId: 'c1' },
  { id: 'l3', prenom: 'Ana', nom: 'Diaz', email: 'ana@x.fr', companyId: 'c2' },
  { id: 'l4', prenom: 'Théo', nom: 'Blanc', email: 'theo@x.fr', companyId: null },
];

const pdfPour: string[][] = [];

vi.mock('@/features/sessions/convocation-groupe', () => ({
  chargerSeance: async () => SEANCE,
  participantsConvoques: async () => PARTICIPANTS,
  construireConvocationGroupe: async (_sb: unknown, _s: unknown, liste: Array<{ nom: string }>) => {
    pdfPour.push(liste.map((p) => p.nom));
    return { bytes: new Uint8Array([1, 2, 3]), filename: 'convocation-groupe-a-2026-10-08.pdf', titre: 'Convocation' };
  },
}));

vi.mock('@/features/espace-entreprise/referents', () => ({
  // Acme a un référent sur son dossier ; Beta n'en a pas.
  referentsDesDossiers: async () => new Map([['d1', { email: 'referent@acme.fr', prenom: 'Rita', contactId: 'k1' }]]),
}));

vi.mock('@/shared/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    schema: () => ({
      from: (table: string) => ({
        select: () => ({
          in: async () =>
            table === 'companies'
              ? {
                  data: [
                    { id: 'c1', name: 'Acme', contact_name: 'Paul', contact_email: 'paul@acme.fr' },
                    { id: 'c2', name: 'Beta', contact_name: null, contact_email: 'rh@beta.fr' },
                  ],
                  error: null,
                }
              : { data: [{ id: 'd1', company_id: 'c1' }, { id: 'd3', company_id: 'c2' }], error: null },
        }),
      }),
    }),
  }),
}));

describe('convocation aux entreprises', () => {
  beforeEach(() => {
    envois.length = 0;
    pdfPour.length = 0;
  });

  it('un envoi par entreprise, aucun pour le particulier', async () => {
    const { sendConvocationsRecap } = await import('@/features/sessions/send-convocations-recap');
    const r = await sendConvocationsRecap('s1');
    expect(r).toMatchObject({ entreprises: 2, envoyes: 2 });
    expect(envois.some((e) => e.to === 'theo@x.fr')).toBe(false);
  });

  it('au référent du dossier d’abord, sinon au contact de l’entreprise', async () => {
    const { sendConvocationsRecap } = await import('@/features/sessions/send-convocations-recap');
    await sendConvocationsRecap('s1');
    expect(envois.map((e) => e.to).sort()).toEqual(['referent@acme.fr', 'rh@beta.fr']);
  });

  it('la liste et le PDF ne portent que les participants de la séance de cette entreprise', async () => {
    const { sendConvocationsRecap } = await import('@/features/sessions/send-convocations-recap');
    await sendConvocationsRecap('s1');
    const acme = envois.find((e) => e.to === 'referent@acme.fr');
    expect(acme?.html).toContain('Léa Martin');
    expect(acme?.html).not.toContain('Ana Diaz');
    expect(acme?.attachments?.[0]?.filename).toBe('convocation-groupe-a-2026-10-08.pdf');
    expect(pdfPour).toContainEqual(['Martin']);
    expect(pdfPour).toContainEqual(['Diaz']);
  });

  it('l’objet nomme le groupe et l’entreprise', async () => {
    const { sendConvocationsRecap } = await import('@/features/sessions/send-convocations-recap');
    await sendConvocationsRecap('s1');
    expect(envois.find((e) => e.to === 'referent@acme.fr')?.subject).toContain('Groupe A Acme');
  });
});
