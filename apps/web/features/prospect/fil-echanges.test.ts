import { describe, it, expect } from 'vitest';
import { filDesEchanges, suiviDe, type EmailJournal, type EvenementDemande } from './fil-echanges';

const email = (o: Partial<EmailJournal>): EmailJournal => ({
  id: 'e1', kind: 'confirmation_preinscription', subject: 'Votre demande', status: 'sent', sent_at: '2026-09-20T10:00:00Z',
  provider_id: null, opened_at: null, open_count: 0, bounced_at: null, metadata: {}, ...o,
});
const note = (o: Partial<EvenementDemande>): EvenementDemande => ({
  id: 'n1', kind: 'comment', payload: { channel: 'call', text: 'Appelée' }, occurred_at: '2026-09-21T10:00:00Z', actor_user_id: null, ...o,
});

describe('le fil des échanges d’une demande', () => {
  it('mêle notes et e-mails, du plus récent au plus ancien', () => {
    const fil = filDesEchanges([note({})], [email({})], 'p1');
    expect(fil.map((f) => f.type)).toEqual(['evenement', 'email']);
  });

  it('un e-mail écrit depuis la fiche n’apparaît qu’une fois, avec son suivi', () => {
    const ev = note({ payload: { channel: 'email', via: 'application', provider_id: 'r-1', text: 'Bonjour' } });
    const fil = filDesEchanges([ev], [email({ id: 'e2', kind: 'message_direct', provider_id: 'r-1', opened_at: '2026-09-21T11:00:00Z', open_count: 2 })], 'p1');
    expect(fil).toHaveLength(1);
    expect(fil[0]).toMatchObject({ type: 'evenement', suivi: { statut: 'ouvert', ouvertures: 2 } });
  });

  it('n’emprunte pas un message écrit depuis une autre demande à la même adresse', () => {
    const fil = filDesEchanges([], [email({ kind: 'message_direct', metadata: { prospect_id: 'p2' } })], 'p1');
    expect(fil).toHaveLength(0);
  });

  it('dit ce qui est arrivé à l’e-mail', () => {
    expect(suiviDe(email({ status: 'failed' })).statut).toBe('echec');
    expect(suiviDe(email({ bounced_at: '2026-09-20T10:01:00Z' })).statut).toBe('rejete');
    expect(suiviDe(email({})).statut).toBe('envoye');
  });
});
