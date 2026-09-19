// Aucune limitation de débit n'existait : le formulaire d'inscription public
// écrit en base avec la clé service role, le proxy SIRENE consomme le quota
// d'une API de l'État en notre nom, et l'import de conventions déclenche des
// appels au modèle le plus cher sur 20 Mo de PDF.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('compteur en base', () => {
  const sql = lire('../../../supabase/migrations/0181_limitation_de_debit.sql');

  it('compte en base, pas en mémoire', () => {
    // Plusieurs instances derrière un répartiteur : un compteur local ne
    // compterait que sa propre part.
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app.rate_limits');
    expect(sql).toContain('PRIMARY KEY (cle, fenetre_debut)');
  });

  it('incrémente et décide dans la même instruction', () => {
    // Un SELECT puis UPDATE laisserait passer deux appels simultanés.
    expect(sql).toContain('ON CONFLICT (cle, fenetre_debut)');
    expect(sql).toContain('RETURNING compteur INTO v_compteur');
  });

  it('la table reste fermée, la fonction réservée au serveur', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION app\.consommer_quota[^;]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION app.consommer_quota(TEXT, INT, INT) TO service_role');
  });

  it('purge les fenêtres closes sans tâche planifiée de plus', () => {
    expect(sql).toContain("DELETE FROM app.rate_limits WHERE fenetre_debut < now() - INTERVAL '1 day'");
  });
});

describe('le garde-fou côté application', () => {
  const src = lire('../shared/lib/http/rate-limit.ts');

  it('ne conserve pas les adresses IP en clair', () => {
    // Une IP est une donnée personnelle : l'empreinte suffit à compter.
    expect(src).toContain("createHash('sha256')");
    expect(src).toContain('empreinte(identifiant)');
  });

  it('laisse passer si le compteur est en panne, en le disant', () => {
    // Bloquer une inscription parce que le garde-fou est cassé ferait plus de
    // dégâts que l'abus qu'il prévient. Les vraies protections sont ailleurs.
    expect(src).toContain('compteur indisponible, appel laissé passer');
    expect(src).toMatch(/if \(error\) \{[\s\S]{0,200}return true;/);
  });

  it('refuse avec 429 et un délai de reprise', () => {
    expect(src).toContain('status: 429');
    expect(src).toContain("'Retry-After'");
  });
});

describe('les entrées exposées sont branchées', () => {
  it('le formulaire d’inscription public, dans ses deux parcours', () => {
    const src = lire('../app/inscription/actions.ts');
    expect(src.match(/quotaDisponible\('inscription'/g)?.length).toBe(2);
  });

  it('le proxy SIRENE, et sa taille de page est bornée', () => {
    const src = lire('../app/api/sirene/search/route.ts');
    expect(src).toContain("quotaDisponible('sirene'");
    // per_page était relayé tel quel vers l'API amont.
    expect(src).toContain('Math.min(Math.max(perPageDemande, 1), 25)');
  });

  it('la lecture de convention par le modèle, par organisation', () => {
    const src = lire('../app/api/import/convention/route.ts');
    expect(src).toContain("quotaDisponible('importIa', membre.organizationId)");
    // Après la garde de rôle : on ne compte pas les appels d'un inconnu.
    expect(src.indexOf('can(membre.role')).toBeLessThan(src.indexOf("quotaDisponible('importIa'"));
  });
});
