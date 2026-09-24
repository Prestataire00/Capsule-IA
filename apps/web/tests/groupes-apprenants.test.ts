// « Parfois j'ai des apprenants sous forme de groupe, Groupe A et Groupe B. Je
// veux sélectionner le groupe correspondant quand je crée une session, et les
// documents doivent être adaptés à chaque groupe. » — Ismael, 24/09/2026.
//
// Jusqu'ici le groupe n'existait que dans le TITRE de la séance — « Groupe A
// (matin) — 28/09/2026 », posé par l'import de la convention. Du texte : rien
// ne savait qui était dans quel groupe. Relevé en base le jour même : sept
// séances nommées d'après un groupe, et aucune table pour le dire.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const MIGRATION = lire('../../../supabase/migrations/0194_groupes_dapprenants.sql');
const ACTIONS = lire('../app/(dashboard)/dossiers/[id]/apprenants/groupes-actions.ts');
const APPRENANTS = lire('../app/(dashboard)/dossiers/[id]/apprenants/actions.ts');
const FORMULAIRE = lire('../app/(dashboard)/dossiers/[id]/sessions/_components/session-form.tsx');
const SEANCES = lire('../app/(dashboard)/dossiers/[id]/sessions/session-actions.ts');

describe('le filtre par groupe est posé PARTOUT où il le faut', () => {
  it('sur la dérivation des participants', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION app.derive_session_attendees');
    expect(MIGRATION).toMatch(/derive_session_attendees[\s\S]*?s\.groupe_id IS NULL/);
  });

  it('et sur les signataires attendus, qui ont leur propre chemin', () => {
    // Le piège : `session_expected_signers` ajoute les apprenants du dossier
    // par une branche à elle, sans passer par `derive_session_attendees`.
    // Filtrer la séance sans toucher à celle-là aurait réduit la séance au
    // groupe tout en laissant la feuille d'émargement lister tout le monde —
    // et cela ne se serait vu qu'en salle, feuille en main.
    const signers = MIGRATION.slice(MIGRATION.indexOf('FUNCTION app.session_expected_signers'));
    expect(signers).toContain('dossier_groupe_membres');
    expect(signers).toMatch(/SELECT groupe_id FROM seance/);
  });

  it('et sur l’inscription d’office au rattachement d’un stagiaire', () => {
    // Elle écrit des lignes `manual_add`, que la dérivation ne retire jamais —
    // elle ne touche qu'aux lignes `derived`. Sans ce tri, ajouter un stagiaire
    // l'aurait inscrit sur les séances des deux groupes.
    expect(APPRENANTS).toContain("not('groupe_id', 'is', null)");
    expect(APPRENANTS).toContain('const sessionsOuvertes');
    expect(APPRENANTS).toContain('sessionsOuvertes.flatMap');
  });

  it('le retrait, lui, porte sur toutes les séances', () => {
    // Quitter le dossier, c'est quitter le Groupe A aussi.
    expect(APPRENANTS).toContain('.in(\'session_id\', garde.ctx.sessionIds)');
  });
});

describe('le modèle', () => {
  it('rattache le groupe au dossier, pas à l’organisme', () => {
    // Un groupe dit comment CE client répartit ses salariés : il n'a pas de
    // sens ailleurs.
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS app.dossier_groupes');
    expect(MIGRATION).toContain('dossier_id       UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE');
  });

  it('interdit deux groupes du même nom dans un dossier', () => {
    expect(MIGRATION).toContain('UNIQUE (dossier_id, nom)');
  });

  it('permet à un stagiaire d’être dans plusieurs groupes', () => {
    // Choix d'Ismael : c'est lui qui affecte. Les dérivations dédoublonnent
    // (UNION, DISTINCT), donc personne n'est compté deux fois au BPF.
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS app.dossier_groupe_membres');
    expect(MIGRATION).toContain('PRIMARY KEY (groupe_id, learner_id)');
  });

  it('ne supprime pas les séances avec le groupe', () => {
    // Perdre six séances parce qu'on renonce à une répartition serait brutal.
    expect(MIGRATION).toContain('REFERENCES app.dossier_groupes(id) ON DELETE SET NULL');
  });

  it('laisse l’existant intact : sans groupe, rien ne change', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS groupe_id');
    expect(MIGRATION).toMatch(/NULL = tout le dossier/);
  });
});

describe('les gestes', () => {
  it('un groupe répartit les inscrits, il n’en ajoute pas', () => {
    expect(ACTIONS).toContain('Ce stagiaire n’est pas inscrit au dossier.');
  });

  it('retirer quelqu’un d’un groupe le retire des séances de ce groupe', () => {
    // Sinon il figurerait encore sur leurs émargements : la dérivation ne
    // retire que les lignes `derived`.
    expect(ACTIONS).toMatch(/eq\('groupe_id', p\.data\.groupeId\)[\s\S]{0,400}session_participants/);
  });

  it('chaque action garde le rôle et l’organisation', () => {
    // Écriture en service role : le middleware ne protège pas les actions.
    expect(ACTIONS.match(/guardAction\('dossiers'\)/g)?.length).toBe(4);
    expect(ACTIONS).toContain('dossierDeLOrganisme');
  });
});

describe('la création d’une séance', () => {
  it('propose le groupe, et seulement s’il y en a', () => {
    expect(FORMULAIRE).toContain('Groupe concerné');
    expect(FORMULAIRE).toContain('{groupes.length > 0 && (');
    expect(FORMULAIRE).toContain('Tout le dossier');
  });

  it('et le transmet jusqu’à la séance', () => {
    expect(FORMULAIRE).toContain('groupeId: form.groupeId || null');
    expect(SEANCES).toContain('groupe_id: input.groupeId ?? null');
  });
});
