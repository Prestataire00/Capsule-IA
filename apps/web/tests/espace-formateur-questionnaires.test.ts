// Espace formateur (phase 2) : questionnaires envoyés par le formateur, évaluations anonymes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TRAINER_SENDABLE_KINDS, isSatisfactionKind } from '@/features/trainer-space/questionnaires';
import { questionnaireInvitationEmail } from '@/features/trainer-space/questionnaire-email';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SQL = lire('../../../supabase/migrations/0151_espace_formateur_questionnaires.sql');

describe('anonymat des réponses de satisfaction', () => {
  it('le suivi d’une séance masque nom, score et réponses de satisfaction', () => {
    expect(SQL).toContain('CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL');
    expect(isSatisfactionKind('satisfaction_chaud')).toBe(true);
    expect(isSatisfactionKind('positionnement')).toBe(false);
  });

  it('les évaluations ne se chiffrent qu’à partir de trois réponses', () => {
    expect(SQL).toContain('CASE WHEN a.n >= 3 THEN round(a.sat, 2) END');
    expect(SQL).toContain('CASE WHEN a.n >= 3 AND a.global = 0 THEN c.commentaires END');
  });

  it('le suivi n’est ouvert que pour les séances du formateur', () => {
    expect(SQL).toContain('WHERE p_session_id IN (SELECT app.my_trainer_session_ids())');
  });
});

describe('envoi par le formateur', () => {
  const actions = lire('../app/(formateur)/seance/[id]/questionnaires/actions.ts');

  it('est gardé : séance du formateur, modèle de son organisme ou du système', () => {
    expect(actions).toContain('await requireMyTrainerSession(p.data.sessionId)');
    expect(actions).toContain('modele.organization_id !== s.organization_id');
    expect(TRAINER_SENDABLE_KINDS).not.toContain('opco');
  });

  it('trace la séance et le formateur, et renvoie vers les questionnaires de l’espace apprenant', () => {
    expect(actions).toContain('session_id: s.id');
    expect(actions).toContain('sent_by_trainer_id: acces.trainerId');
    expect(actions).toContain('`${lien.url}/questionnaires`');
  });

  it('l’e-mail échappe le texte et annonce l’anonymat', () => {
    const m = questionnaireInvitationEmail({
      firstName: '<b>Léa</b>', trainerName: 'A', questionnaireTitle: 'Avis', formationTitle: 'Excel', url: 'https://x', anonymous: true,
    });
    expect(m.html).toContain('&lt;b&gt;Léa&lt;/b&gt;');
    expect(m.html).toContain('restent anonymes');
  });
});
