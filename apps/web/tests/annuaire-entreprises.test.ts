// « Connecte l'API gouv » — Ismael, 24/09/2026, après qu'un SIRET valide
// eut été refusé à la saisie : autant ne plus le taper du tout.
//
// L'autocomplétion existait déjà, mais seulement dans le tunnel d'inscription
// public et sur « nouvelle entreprise ». Le formulaire de demande — celui que
// l'organisme utilise toute la journée — en était dépourvu, et c'est là que la
// saisie manuelle produisait ses coquilles.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { etablissementRecherche } from '../app/inscription/entreprise-autocomplete';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const AUTOCOMPLETE = lire('app/inscription/entreprise-autocomplete.tsx');
const DEMANDE = lire('app/(dashboard)/prospects/nouvelle/demande-form.client.tsx');
const PROXY = lire('app/api/sirene/search/route.ts');

describe('l’établissement retenu', () => {
  // Relevé le 24/09/2026 sur BOULANGERIES PAUL : le siège est à
  // Marcq-en-Barœul, l'établissement 40305211100107 à Charleville-Mézières.
  const siege = { siret: '40305211102616', adresse: null, code_postal: null, libelle_commune: 'MARCQ-EN-BARŒUL' };
  const succursale = { siret: '40305211100107', adresse: null, code_postal: null, libelle_commune: 'CHARLEVILLE-MEZIERES' };

  it('est celui que la recherche a trouvé, pas le siège', () => {
    // Reprendre le siège aurait remplacé en silence le SIRET que l'utilisateur
    // venait de taper, et rattaché le dossier à la mauvaise adresse.
    expect(etablissementRecherche({ siege, matching_etablissements: [succursale] })?.siret).toBe('40305211100107');
  });

  it('retombe sur le siège quand la recherche ne désigne rien', () => {
    expect(etablissementRecherche({ siege })?.siret).toBe('40305211102616');
    expect(etablissementRecherche({ siege, matching_etablissements: [] })?.siret).toBe('40305211102616');
  });

  it('ne rend rien plutôt que d’inventer', () => {
    expect(etablissementRecherche({})).toBeNull();
  });
});

describe('la convention collective', () => {
  it('est reprise de l’annuaire', () => {
    // L'INSEE rend l'IDCC déclaré (« 1486 » pour SOLUTIONS TERRAIN) : c'est lui
    // qui détermine l'OPCO de rattachement et le barème applicable.
    expect(AUTOCOMPLETE).toContain('hit.complements?.liste_idcc?.[0] ?? null');
    expect(AUTOCOMPLETE).toContain('IDCC {idcc}');
  });

  it('n’écrase pas celle que l’organisme a saisie', () => {
    // L'INSEE ne connaît que la convention déclarée ; l'organisme peut en
    // savoir plus que le registre.
    expect(DEMANDE).toContain("conventionCollective: f.conventionCollective.trim() || (c.idcc ?? '')");
  });
});

describe('une panne de l’annuaire', () => {
  it('ne se dit plus « aucun résultat »', () => {
    // Le proxy répond 200 avec une liste vide quand l'amont est injoignable :
    // sans lire `error`, la panne passait pour une absence, et l'utilisateur
    // s'obstinait à corriger une recherche qui n'avait jamais été faite.
    expect(PROXY).toContain("error: 'upstream_unreachable'");
    expect(AUTOCOMPLETE).toContain('setPanne(Boolean(data?.error))');
    expect(AUTOCOMPLETE).toContain('L’annuaire des entreprises n’a pas répondu');
  });

  it('distingue un abandon de requête d’une vraie panne', () => {
    // Chaque frappe annule la précédente : compter ces abandons pour des
    // pannes aurait affiché l'avertissement en permanence.
    expect(AUTOCOMPLETE).toContain("if ((e as Error)?.name !== 'AbortError') setPanne(true)");
  });
});

describe('le formulaire de demande', () => {
  it('propose la recherche dès qu’une entreprise est en jeu', () => {
    expect(DEMANDE).toContain('<EntrepriseAutocomplete');
    expect(DEMANDE).toContain('companySiret: c.siret || f.companySiret');
  });

  it('laisse la saisie manuelle ouverte', () => {
    // L'annuaire ignore les entreprises très récentes : imposer la recherche
    // aurait rendu certaines demandes impossibles à enregistrer.
    expect(DEMANDE).toContain("set('companyName', e.target.value)");
    expect(DEMANDE).toContain("set('companySiret', e.target.value)");
  });
});

describe('tous les appels passent par notre proxy', () => {
  it('aucun écran n’interroge l’annuaire depuis le navigateur', () => {
    // Un appel direct dépend du CSP de la page, et consomme le quota de l'API
    // de l'État sans qu'aucun compteur ne le sache.
    //
    // On cherche l'adresse dans une chaîne, pas n'importe où : le composant
    // d'autocomplétion cite le domaine dans un commentaire, précisément pour
    // dire qu'il ne l'appelle pas directement.
    const clients: string[] = [];
    const parcourir = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
          const src = fs.readFileSync(p, 'utf-8');
          // La directive n'est pas toujours en première ligne : plusieurs
          // écrans la font précéder d'un « // ARCHETYPE: ». Chercher au tout
          // début du fichier faisait passer le test à vide sur ceux-là.
          const estClient = src.split('\n', 5).some((l) => /^['"]use client['"]/.test(l.trim()));
          if (estClient && /['"`]https:\/\/recherche-entreprises/.test(src)) {
            clients.push(path.relative(path.resolve(__dirname, '..'), p));
          }
        }
      }
    };
    parcourir(path.resolve(__dirname, '../app'));
    expect(clients).toEqual([]);
  });

  it('et le proxy compte ce qu’il consomme', () => {
    expect(PROXY).toContain("quotaDisponible('sirene'");
  });
});
