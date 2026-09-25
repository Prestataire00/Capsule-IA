// « Pareil pour les fiches besoin : on voit les réponses des apprenants sur la
// session » — avec, comme chez RFC, une ligne par stagiaire, son statut, et de
// quoi renvoyer ou remplir. Demande d'Ismael du 22/09/2026.
//
// L'écran savait déjà afficher les réponses reçues, en fusionnant les deux
// sources (questionnaire et inscription). Ce qui manquait, ce sont les gestes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/sessions/[id]/fiches-besoin/actions.ts');
const CLIENT = lire('../app/(dashboard)/sessions/[id]/fiches-besoin/actions-fiche.client.tsx');
const PAGE = lire('../app/(dashboard)/sessions/[id]/fiches-besoin/page.tsx');
const CARTE = lire('../features/questionnaire/ui/needs-card.tsx');

describe('les deux gestes par stagiaire', () => {
  it('renvoyer la fiche, ou la remplir pour lui', () => {
    expect(ACTIONS).toContain('export async function renvoyerFicheBesoin');
    expect(ACTIONS).toContain('export async function saisirFicheBesoinApprenant');
    expect(CLIENT).toContain('Renvoyer');
    expect(CLIENT).toContain('Remplir');
  });

  it('réutilise l’envoi existant plutôt que d’en réécrire un', () => {
    expect(ACTIONS).toContain('sendNeedsAnalysisForLearner({ learnerId, sb })');
  });

  it('dit pourquoi rien n’est parti, au lieu d’un silence', () => {
    // « Rien envoyé » sans raison laisse croire à une panne.
    for (const cas of ['reused_inscription', 'skipped_existing', 'no_email', 'no_base_url']) {
      expect(ACTIONS, cas).toContain(cas);
    }
  });

  it('distingue une adresse manquante d’un envoi réussi', () => {
    expect(ACTIONS).toContain("r.status === 'no_email' || r.status === 'no_base_url' || r.status === 'not_found'");
  });
});

describe('la saisie par l’organisme', () => {
  it('écrit là où l’écran lit', () => {
    // Dans l'assignation et sa réponse, pas dans la demande : à ce stade le
    // dossier existe, et c'est lui qui porte la preuve attendue en audit.
    expect(ACTIONS).toContain("from('questionnaire_responses')");
    expect(ACTIONS).toContain("from('questionnaire_assignments')");
  });

  it('crée l’assignation si elle manque, sans en faire deux', () => {
    expect(ACTIONS).toContain("eq('recipient_learner_id', learnerId)");
    expect(ACTIONS).toContain("onConflict: 'assignment_id'");
  });

  it('trace que la réponse a été notée par l’organisme', () => {
    // En audit, ce n'est pas la même preuve que la parole du stagiaire.
    expect(ACTIONS).toContain("input_by: 'admin'");
  });

  it('borne ce qui est enregistré', () => {
    // `nettoyerReponses` prend désormais les clés autorisées en second
    // argument : celles du modèle de l'organisme, quand il en a paramétré un.
    // Sans elles, ses questions étaient jetées ici sans un mot (25/09/2026).
    expect(ACTIONS).toContain('nettoyerReponses(reponses, clesDeQuestions(questions))');
  });

  it('vérifie que le stagiaire est bien de l’organisme', () => {
    // L'identifiant vient de l'écran : il ne prouve rien.
    expect(ACTIONS.match(/apprenantDeLOrganisme\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('réservé à qui gère la conformité', () => {
    expect(ACTIONS.match(/guardAction\('qualiopi'\)/g)?.length).toBe(2);
    expect(PAGE).toContain("canManageSection('qualiopi')");
  });
});

describe('l’écran', () => {
  it('garde le statut par stagiaire, déjà en place', () => {
    expect(CARTE).toContain('Envoyée, en attente');
    expect(CARTE).toContain('Non envoyée');
  });

  it('accueille les actions sans les imposer', () => {
    // L'espace formateur affiche la même carte, en lecture seule.
    expect(CARTE).toContain('actions?: React.ReactNode');
    expect(PAGE).toContain('peutAgir ? (');
  });

  it('ne pré-remplit le formulaire que d’une fiche réellement reçue', () => {
    expect(PAGE).toContain("f.statut === 'recue' ? (f.answers as never) : null");
  });
});
