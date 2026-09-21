// La 0175 a introduit le groupe d'apprenants du dossier
// (`app.dossier_learners`) sans reprendre ce qui lisait l'ancien modèle « un
// dossier = un apprenant ». Recette du 20/09/2026, reproduite en base :
//
//   · une séance ajoutée après les stagiaires n'inscrivait personne, et la
//     feuille d'émargement n'attendait que le titulaire (1 sur 3) ;
//   · deux stagiaires sur trois n'avaient aucun espace apprenant.
//
// Ces tests gardent la règle : partout où l'on cherche « les apprenants d'un
// dossier » ou « les dossiers d'un apprenant », le groupe doit être lu.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const lire = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8');

const SEANCE = lire('0186_seance_recupere_les_apprenants_du_dossier.sql');
const ESPACE = lire('0187_espace_apprenant_pour_tout_le_groupe.sql');

describe('les apprenants d’un dossier', () => {
  it('sont le groupe s’il existe, le titulaire sinon', () => {
    expect(SEANCE).toContain('FUNCTION app.dossier_apprenants');
    expect(SEANCE).toContain('FROM app.dossier_learners dl');
    // Le titulaire ne compte plus dès qu'un groupe est constitué : sur un
    // dossier importé, c'est le stagiaire provisoire « à désigner », qui n'a
    // rien à faire sur une feuille d'émargement.
    expect(SEANCE).toContain('NOT EXISTS (SELECT 1 FROM app.dossier_learners dl2');
  });

  it('remontent à une séance rattachée directement, pas seulement par la table de liaison', () => {
    // Une séance créée depuis un dossier porte `sessions.dossier_id` et n'a
    // aucune ligne dans `session_dossiers` : ne lire que la liaison ne trouvait
    // rien du tout.
    expect(SEANCE).toContain('FUNCTION app.session_dossier_ids');
    expect(SEANCE).toMatch(/FROM app\.sessions s\s*\n\s*WHERE s\.id = p_session_id AND s\.dossier_id IS NOT NULL/);
    expect(SEANCE).toContain('FROM app.session_dossiers sd');
  });

  it('alimentent la dérivation des participants', () => {
    expect(SEANCE).toContain('FUNCTION app.derive_session_attendees');
    expect(SEANCE).toContain('app.session_dossier_ids(p_session_id)');
    expect(SEANCE).toContain('app.dossier_apprenants(d.id)');
  });

  it('alimentent aussi les signataires attendus sur la feuille', () => {
    expect(SEANCE).toContain('FUNCTION app.session_expected_signers');
    const fonction = SEANCE.slice(SEANCE.indexOf('FUNCTION app.session_expected_signers'));
    expect(fonction).toContain('app.dossier_apprenants(d.id)');
    // Le titulaire seul ne doit plus être ajouté en dur.
    expect(fonction).not.toContain("SELECT 'learner', d.learner_id");
  });

  it('n’élargit rien d’autre : les formateurs restent ceux du dossier', () => {
    // La 0145 les lit dans `dossier_trainers`, pas dans `session_trainers` :
    // changer cette source ajouterait des signataires inattendus.
    const fonction = SEANCE.slice(SEANCE.indexOf('FUNCTION app.session_expected_signers'));
    expect(fonction).toContain('FROM app.dossier_trainers dt');
    expect(fonction).not.toContain('FROM app.session_trainers');
  });

  it('gardent la fenêtre de dates du dossier', () => {
    // Un stagiaire n'est attendu qu'entre son entrée et sa sortie.
    expect(SEANCE).toContain('WHERE s.starts_at::date BETWEEN d.start_date AND d.end_date');
  });
});

describe('les dossiers d’un apprenant', () => {
  it('incluent ceux où il est simplement membre du groupe', () => {
    expect(ESPACE).toContain('FUNCTION app.apprenant_dossier_ids');
    expect(ESPACE).toContain('FROM app.dossier_learners dl');
    expect(ESPACE).toContain('d.learner_id = p_learner_id');
  });

  it('servent les quatre sous-requêtes du tableau de bord apprenant', () => {
    // Dossier, séances, modules et formateur portaient la même clause : n'en
    // corriger qu'une aurait donné un espace à moitié vide.
    expect(ESPACE.match(/app\.apprenant_dossier_ids\(p_learner_id\)/g)?.length).toBe(4);
    expect(ESPACE).not.toContain('WHERE d.learner_id = p_learner_id\n');
  });

  it('écartent les dossiers supprimés', () => {
    expect(ESPACE).toContain('d.deleted_at IS NULL');
  });
});

describe('les chemins applicatifs concernés', () => {
  const app = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

  it('la création d’une séance dérive bien les participants', () => {
    // C'est cet appel qui ne trouvait rien : il reste, c'est la fonction
    // qu'il appelle qui est corrigée.
    expect(app('../app/(dashboard)/dossiers/[id]/sessions/session-actions.ts')).toContain(
      "rpc('materialize_session_participants'",
    );
  });

  it('l’inscription d’un stagiaire écrit dans le groupe du dossier', () => {
    const src = app('../app/(dashboard)/dossiers/[id]/apprenants/actions.ts');
    expect(src).toContain("from('dossier_learners' as never)");
    // Et l'inscrit aux séances déjà planifiées — l'inverse (séance créée
    // ensuite) est ce que la 0186 répare.
    expect(src).toContain("from('session_participants')");
  });
});

// Constat du 21/09/2026 : Alice, ajoutée comme apprenante d'un dossier, ne le
// voyait pas sur sa fiche. La page ne lisait que `dossiers.learner_id` — le
// titulaire — alors qu'elle figurait dans le groupe. Même origine que la 0175.
describe('la fiche d’un apprenant', () => {
  const app = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
  const PAGE = app('../app/(dashboard)/apprenants/[id]/page.tsx');
  const ACTIONS = app('../app/(dashboard)/apprenants/[id]/rattacher-actions.ts');

  it('montre les dossiers où il est simplement membre du groupe', () => {
    expect(PAGE).toContain("rpc('apprenant_dossier_ids'");
    expect(PAGE).not.toContain(".eq('learner_id', params.id)");
  });

  it('permet de le rattacher à un dossier et à une entreprise', () => {
    expect(ACTIONS).toContain('export async function rattacherAuDossier');
    expect(ACTIONS).toContain('export async function rattacherAEntreprise');
    expect(PAGE).toContain('<Rattachements');
  });

  it('le rattachement l’inscrit aussi aux séances déjà planifiées', () => {
    // Sans cela il est sur le dossier mais absent des feuilles d'émargement.
    expect(ACTIONS).toContain("from('session_participants')");
    expect(ACTIONS).toContain("source: 'manual_add' as const");
  });

  it('vérifie que la cible appartient bien à l’organisme', () => {
    expect(ACTIONS).toContain("eq('organization_id', organizationId)");
    expect(ACTIONS.match(/memeOrganisme\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('laisse détacher d’une entreprise', () => {
    // Un salarié qui quitte son entreprise reste apprenant de l'organisme.
    expect(ACTIONS).toContain('company_id: companyId || null');
  });

  it('ne propose que les dossiers où il ne figure pas déjà', () => {
    expect(PAGE).toContain('!dejaDedans.has(d.id)');
  });
});
