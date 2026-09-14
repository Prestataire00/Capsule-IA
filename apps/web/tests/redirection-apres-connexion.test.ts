// Garde-fou : la page demandée avant connexion ne doit pas renvoyer un
// utilisateur vers un espace qui n'est pas le sien. Un administrateur dont
// l'onglet était resté sur l'espace formateur atterrissait sinon là-bas, puis
// était refoulé avec « votre compte n'est rattaché à aucune fiche formateur ».
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { estRouteFormateur, destinationAutorisee, ROUTES_FORMATEUR } from '@/shared/lib/auth/trainer-routes';

const ADMIN = { estMembre: true, estFormateur: false };
const FORMATEUR = { estMembre: false, estFormateur: true };
const INTERNE = { estMembre: true, estFormateur: true };

describe('reconnaissance des routes de l’espace formateur', () => {
  it('reconnaît une racine et ses sous-pages', () => {
    expect(estRouteFormateur('/formateur')).toBe(true);
    expect(estRouteFormateur('/seance/abc-123/supports')).toBe(true);
    expect(estRouteFormateur('/mes-factures/nouvelle')).toBe(true);
  });

  it('ne confond pas un préfixe avec un autre mot', () => {
    // `/formateurs` est la page d'administration, pas l'espace du formateur.
    expect(estRouteFormateur('/formateurs')).toBe(false);
    expect(estRouteFormateur('/formateurs/abc-123')).toBe(false);
  });

  it('ignore la chaîne de requête', () => {
    expect(estRouteFormateur('/mon-planning?semaine=2')).toBe(true);
    expect(estRouteFormateur('/dossiers?tri=date')).toBe(false);
  });
});

describe('destination autorisée après connexion', () => {
  it('refuse l’espace formateur à un membre qui n’a pas de fiche', () => {
    expect(destinationAutorisee('/formateur', ADMIN)).toBe(false);
    expect(destinationAutorisee('/mes-sessions', ADMIN)).toBe(false);
  });

  it('laisse le membre revenir où il était dans l’espace de l’organisme', () => {
    expect(destinationAutorisee('/dossiers', ADMIN)).toBe(true);
    expect(destinationAutorisee('/supports', ADMIN)).toBe(true);
  });

  it('refuse l’espace de l’organisme à un formateur externe', () => {
    expect(destinationAutorisee('/dossiers', FORMATEUR)).toBe(false);
    expect(destinationAutorisee('/mes-sessions', FORMATEUR)).toBe(true);
  });

  it('ouvre les deux espaces à un formateur interne', () => {
    expect(destinationAutorisee('/dossiers', INTERNE)).toBe(true);
    expect(destinationAutorisee('/mon-planning', INTERNE)).toBe(true);
  });
});

describe('la liste des racines suit le dossier (formateur)', () => {
  it('déclare chaque racine réellement présente dans app/(formateur)', () => {
    const racine = path.resolve(__dirname, '../app/(formateur)');
    const surDisque = fs
      .readdirSync(racine, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('(') && e.name !== 'api')
      .map((e) => `/${e.name}`);

    const oubliees = surDisque.filter((r) => !(ROUTES_FORMATEUR as readonly string[]).includes(r));
    expect(oubliees, 'racines de l’espace formateur absentes de ROUTES_FORMATEUR').toEqual([]);
  });
});
