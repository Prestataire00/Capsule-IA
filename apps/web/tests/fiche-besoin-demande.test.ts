// Le parcours décrit par Ismael le 21/09/2026 : je crée une demande, j'envoie
// la fiche besoin au client OU je la remplis moi-même, et dans les deux cas la
// réponse complète la fiche de la demande — laquelle constitue le dossier.
//
// Trois ruptures existaient : aucun bouton d'envoi, la saisie interne plantait,
// et le flux était à sens unique (le client répondait, la demande restait vide).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { questionsDuSchema, ficheBesoinRemplie, CHAMPS_FICHE_BESOIN } from '@/features/questionnaire/fiche-besoin';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('un seul jeu de questions', () => {
  it('lit le modèle enregistré sous sa forme « fields »', () => {
    // C'est la forme du modèle de fiche besoin posé par le code. L'écran de
    // saisie ne lisait que `questions` : il appelait .map() sur undefined.
    const q = questionsDuSchema({
      version: 1,
      fields: [
        { key: 'currentLevel', kind: 'rating_5' },
        { key: 'objectives', kind: 'long_text' },
      ],
    });
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ id: 'currentLevel', type: 'rating', max: 5 });
    expect(q[1]).toMatchObject({ id: 'objectives', type: 'text', required: true });
  });

  it('lit aussi la forme « questions » des modèles de l’éditeur', () => {
    const q = questionsDuSchema({ questions: [{ id: 'a', type: 'text', label: 'A', required: false }] });
    expect(q).toHaveLength(1);
  });

  it('ne tombe pas sur un schéma vide, absent ou malformé', () => {
    for (const v of [null, undefined, {}, { fields: 'x' }, { questions: null }]) {
      expect(questionsDuSchema(v)).toEqual([]);
    }
  });

  it('donne un libellé lisible, jamais la clé technique', () => {
    const q = questionsDuSchema({ fields: [{ key: 'accommodations', kind: 'long_text' }] });
    expect(q[0]?.label).toContain('aménagement');
  });

  it('une fiche n’est remplie que si les objectifs le sont', () => {
    expect(ficheBesoinRemplie(null)).toBe(false);
    expect(ficheBesoinRemplie({ currentLevel: 3 })).toBe(false);
    expect(ficheBesoinRemplie({ objectives: 'Maîtriser HACCP' })).toBe(true);
  });

  it('conserve le contexte de typologie, perdu jusqu’ici', () => {
    expect(CHAMPS_FICHE_BESOIN.map((c) => c.cle)).toContain('typologyContext');
  });
});

describe('les deux gestes sur une demande', () => {
  const ACTIONS = lire('../app/(dashboard)/prospects/[id]/fiche-besoin-actions.ts');
  const CONTROLS = lire('../app/(dashboard)/prospects/[id]/fiche-besoin-controls.client.tsx');
  const PAGE = lire('../app/(dashboard)/prospects/[id]/page.tsx');

  it('envoyer, et remplir soi-même', () => {
    expect(ACTIONS).toContain('export async function envoyerFicheBesoinDemande');
    expect(ACTIONS).toContain('export async function saisirFicheBesoinDemande');
    expect(CONTROLS).toContain('Envoyer la fiche besoin');
    expect(CONTROLS).toContain('Remplir moi-même');
  });

  it('la saisie et la réponse du client écrivent au même endroit', () => {
    // Envoyer un lien n'écrit rien : c'est la saisie interne et le formulaire
    // du client qui remplissent `prospects.needs_analysis`, la colonne que lit
    // la fiche de la demande.
    const CLIENT = lire('../app/questionnaire/besoin-demande/[token]/actions.ts');
    for (const [nom, src] of [['saisie interne', ACTIONS], ['formulaire client', CLIENT]] as const) {
      expect(src, nom).toContain("from('prospects')");
      expect(src, nom).toContain('needs_analysis:');
    }
  });

  it('distingue ce que le client a dit de ce que nous avons noté', () => {
    // En audit, ce n'est pas la même preuve.
    expect(ACTIONS).toContain("rempliPar: 'organisme'");
  });

  it('refuse d’envoyer un lien vers la machine de développement', () => {
    expect(ACTIONS).toContain("base.includes('localhost')");
  });

  it('relancer reste possible : pas de clé d’unicité sur cet envoi', () => {
    // Une relance demandée par l'organisme ne doit pas être avalée comme un
    // doublon (0180).
    expect(ACTIONS).not.toContain('idempotencyKey');
    expect(CONTROLS).toContain('Renvoyer au client');
  });

  it('réservé au CRM, et l’écran ne les montre qu’à qui peut agir', () => {
    expect(ACTIONS.match(/guardAction\('crm'\)/g)?.length).toBe(2);
    expect(PAGE).toContain('<ManageOnly section="crm">');
  });
});

describe('le retour vers la demande', () => {
  const PUBLIC = lire('../app/questionnaire/besoin/[token]/actions.ts');
  const DEMANDE = lire('../app/questionnaire/besoin-demande/[token]/actions.ts');

  it('la réponse par le lien du dossier complète la demande d’origine', () => {
    expect(PUBLIC).toContain("eq('converted_dossier_id', dossierId)");
    expect(PUBLIC).toContain('needs_analysis:');
  });

  it('sans écraser ce que la demande portait déjà', () => {
    // Le formulaire du dossier ne pose pas la question de typologie.
    expect(PUBLIC).toContain('...(d.needs_analysis ?? {})');
  });

  it('et sans jamais faire échouer la réponse du client', () => {
    expect(PUBLIC).toMatch(/try \{[\s\S]{0,1400}catch \(e\) \{[\s\S]{0,200}report vers la demande impossible/);
  });

  it('le formulaire de demande borne ce qu’il accepte du dehors', () => {
    expect(DEMANDE).toContain('export function nettoyerReponses');
    expect(DEMANDE).toContain('.slice(0, 2000)');
    expect(DEMANDE).toContain('n >= 1 && n <= 5');
  });

  it('son jeton a une audience distincte des autres liens publics', () => {
    const TOKEN = lire('../shared/lib/fiche-besoin-token.ts');
    expect(TOKEN).toContain("AUDIENCE = 'fiche-besoin-demande'");
    expect(TOKEN).toContain("algorithms: ['HS256']");
  });
});

describe('le fil demande ↔ dossier', () => {
  it('depuis la demande, on ouvre son dossier', () => {
    expect(lire('../app/(dashboard)/prospects/[id]/page.tsx')).toContain('href={`/dossiers/${convertedDossierId}`}');
  });

  it('depuis le dossier, on remonte à sa demande', () => {
    const LAYOUT = lire('../app/(dashboard)/dossiers/[id]/layout.tsx');
    expect(LAYOUT).toContain("eq('converted_dossier_id', params.id)");
    expect(LAYOUT).toContain('Demande d’origine');
  });
});
