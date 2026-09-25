// « Questionnaires entreprise en plus des apprenants et financeurs dans les
// dossiers, + ajouter un questionnaire formateur » — 25/09/2026.
//
// Relevé en base le jour même : sur 32 assignations, aucune n'était destinée à
// un formateur ni à une entreprise. `recipient_kind` acceptait pourtant déjà
// 'trainer' et 'company_rep' — les valeurs existaient, les chemins non.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/dossiers/[id]/questionnaires/actions.ts');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/questionnaires/page.tsx');
const MODELE_ENTREPRISE = lire('../features/questionnaire/satisfaction-entreprise.ts');
const MODELE_FORMATEUR = lire('../features/questionnaire/satisfaction-formateur.ts');
const CRON = lire('../app/api/cron/transactional-emails/route.ts');
const MIGRATION = lire('../../../supabase/migrations/0196_questionnaire_entreprise.sql');
const PAGE_PUBLIQUE = lire('../app/questionnaire/financeur/[token]/page.tsx');

describe('le formateur', () => {
  it('se demande à la main, plus seulement à la fin du dossier', () => {
    // Il partait tout seul le lendemain d'un dossier terminé — le seul moment
    // possible. Un dossier clos sans que l'automatisation parte, une session
    // qui s'est mal passée : rien ne permettait de le demander.
    expect(ACTIONS).toContain('export const sendTrainerQuestionnaire');
    expect(PAGE).toContain('<SendTrainer');
  });

  it('avec le modèle de l’envoi automatique, pas un second', () => {
    // Deux modèles du même nom aux questions différentes rendraient les
    // réponses incomparables d'une formation à l'autre.
    expect(MODELE_FORMATEUR).toContain("TRAINER_SAT_TEMPLATE_CODE = 'satisfaction_formateur_default'");
    expect(ACTIONS).toContain('ensureTrainerSatisfactionTemplate');
    expect(CRON).toContain("import { ensureTrainerSatisfactionTemplate } from '@/features/questionnaire/satisfaction-formateur'");
    // Et le cron ne garde pas sa copie privée.
    expect(CRON).not.toContain('async function ensureTrainerSatisfactionTemplate');
  });

  it('une seule assignation par formateur et par dossier', () => {
    // Deux liens en parallèle donneraient deux réponses partielles sur la même
    // case.
    expect(ACTIONS).toMatch(/recipient_kind', 'trainer'[\s\S]{0,200}recipient_trainer_id/);
  });

  it('un formateur sans adresse ne bloque pas', () => {
    expect(ACTIONS).toContain('let envoye = false;');
    expect(ACTIONS).toMatch(/Sans adresse, le lien reste affiché/);
  });
});

describe('l’entreprise', () => {
  it('a désormais son questionnaire', () => {
    expect(ACTIONS).toContain('export const sendCompanyQuestionnaire');
    expect(PAGE).toContain('<SendCompany');
    expect(PAGE).toContain('Questionnaires entreprise');
  });

  it('répond par une personne nommée, pas par une société', () => {
    // Sans destinataire identifié, la réponse n'est rattachable à personne —
    // or c'est ce qu'un audit demande d'une preuve.
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS recipient_contact_id');
    expect(ACTIONS).toContain("recipient_kind: 'company_rep'");
    expect(ACTIONS).toContain('recipient_contact_id: parsedInput.contactId');
  });

  it('et le contact doit appartenir à l’entreprise du dossier', () => {
    // L'identifiant vient de l'écran : sans ce filtre, le contact d'un autre
    // client recevrait le questionnaire de celui-ci.
    expect(ACTIONS).toContain("eq('company_id', d.company_id)");
  });

  it('ses questions sont celles du commanditaire, pas celles du stagiaire', () => {
    // Un salarié dit s'il a appris ; son employeur dit si ça a servi.
    expect(MODELE_ENTREPRISE).toContain('effetTerrain');
    expect(MODELE_ENTREPRISE).toContain('objectifsAtteints');
    expect(MODELE_ENTREPRISE).toContain('besoinsSuite');
  });

  it('la suppression du contact n’efface pas la réponse', () => {
    // Une preuve d'audit ne disparaît pas avec une fiche.
    expect(MIGRATION).toContain('ON DELETE SET NULL');
  });
});

describe('la page de réponse', () => {
  it('sert les deux destinataires, avec le bon libellé', () => {
    // La dupliquer pour changer trois mots aurait fait deux écrans qui
    // auraient divergé.
    expect(PAGE_PUBLIQUE).toContain("=== 'company_rep'");
    expect(PAGE_PUBLIQUE).toContain("'Questionnaire entreprise'");
    expect(PAGE_PUBLIQUE).toContain('{ctx.destinataire}');
  });

  it('mais l’entreprise a sa propre adresse', () => {
    // Recevoir un lien « /questionnaire/financeur » quand on est le client, et
    // non son financeur, sème un doute au pire moment.
    const alias = path.resolve(__dirname, '../app/questionnaire/entreprise/[token]/page.tsx');
    expect(fs.existsSync(alias)).toBe(true);
    expect(ACTIONS).toContain('`/questionnaire/entreprise/${signed.token}`');
  });
});
