import { describe, expect, it } from 'vitest';
import {
  compterEnvois,
  etatCourriel,
  etatEnvoi,
  libelleQuestionnaire,
  trierEnvois,
  type Courriel,
  type EnvoiQuestionnaire,
} from './suivi-envois';

const maintenant = new Date('2026-10-06T12:00:00Z');

const envoi = (p: Partial<EnvoiQuestionnaire>): EnvoiQuestionnaire => ({
  id: 'a',
  questionnaire: 'Positionnement',
  modeleId: 't',
  destinataire: 'learner',
  nom: 'Léa Zola',
  email: null,
  envoyeLe: '2026-10-01T09:00:00Z',
  relances: 0,
  derniereRelance: null,
  echeance: null,
  status: 'pending',
  reponduLe: null,
  ...p,
});

const courriel = (p: Partial<Courriel>): Courriel => ({
  id: 'c',
  kind: 'satisfaction_chaud',
  destinataire: 'rh@client.fr',
  sujet: null,
  status: 'sent',
  envoyeLe: '2026-10-01T09:00:00Z',
  delivreLe: null,
  ouvertLe: null,
  cliqueLe: null,
  rebondLe: null,
  ...p,
});

describe('état d’un questionnaire envoyé', () => {
  it('répondu prime sur l’échéance passée', () => {
    expect(etatEnvoi({ status: 'completed', echeance: '2026-09-01T00:00:00Z' }, maintenant).libelle).toBe('Répondu');
  });
  it('en retard une fois l’échéance passée sans réponse', () => {
    expect(etatEnvoi({ status: 'pending', echeance: '2026-10-05T00:00:00Z' }, maintenant)).toEqual({ libelle: 'En retard', ton: 'warning' });
  });
  it('jamais le statut brut de la base', () => {
    expect(etatEnvoi({ status: 'pending', echeance: null }, maintenant).libelle).toBe('En attente');
    expect(etatEnvoi({ status: 'in_progress', echeance: null }, maintenant).libelle).toBe('Commencé');
    expect(etatEnvoi({ status: 'expired', echeance: null }, maintenant).libelle).toBe('Expiré');
  });
});

describe('compteurs', () => {
  it('taux de réponse arrondi, nul sans envoi', () => {
    expect(compterEnvois([])).toEqual({ envoyes: 0, repondus: 0, enAttente: 0, tauxReponse: null });
    const c = compterEnvois([envoi({ status: 'completed' }), envoi({}), envoi({ status: 'expired' })]);
    expect(c).toEqual({ envoyes: 3, repondus: 1, enAttente: 1, tauxReponse: 33 });
  });
});

describe('tri', () => {
  it('le plus récent d’abord, puis apprenant avant entreprise', () => {
    const t = trierEnvois([
      envoi({ id: 'vieux', envoyeLe: '2026-09-01T00:00:00Z' }),
      envoi({ id: 'ent', destinataire: 'company_rep' }),
      envoi({ id: 'app' }),
    ]);
    expect(t.map((e) => e.id)).toEqual(['app', 'ent', 'vieux']);
  });
});

describe('libellés', () => {
  it('type connu, sinon titre du modèle', () => {
    expect(libelleQuestionnaire('satisfaction_chaud', 'X')).toBe('Satisfaction à chaud');
    expect(libelleQuestionnaire('custom', 'Quiz Excel')).toBe('Quiz Excel');
    expect(libelleQuestionnaire(null, null)).toBe('Questionnaire');
  });
});

describe('état d’un e-mail', () => {
  it('le rebond l’emporte sur l’ouverture', () => {
    expect(etatCourriel(courriel({ ouvertLe: 'x', rebondLe: 'y' })).ton).toBe('danger');
  });
  it('du clic au simple envoi', () => {
    expect(etatCourriel(courriel({ cliqueLe: 'x', ouvertLe: 'x' })).libelle).toBe('Lien ouvert');
    expect(etatCourriel(courriel({ ouvertLe: 'x' })).libelle).toBe('Lu');
    expect(etatCourriel(courriel({ delivreLe: 'x' })).libelle).toBe('Délivré');
    expect(etatCourriel(courriel({})).libelle).toBe('Envoyé');
    expect(etatCourriel(courriel({ status: 'failed' })).libelle).toBe('Non parti');
  });
});
