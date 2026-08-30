// Garde-fou anti-régression : une fonction `SECURITY DEFINER` accordée à `anon`
// est exécutable depuis Internet avec la clé publique du bundle navigateur.
// Elle contourne la RLS par construction : son unique autorisation devient donc
// la connaissance de ses arguments.
//
// Faille réelle corrigée le 2026-08-30 (CAP-13) : cinq RPC du schéma `app`
// n'exigeaient qu'un UUID d'apprenant — UUID lisible en clair dans la charge
// utile base64 du jeton de l'espace apprenant. Un lien transféré ou expiré
// donnait un accès permanent au tableau de bord, aux réclamations, aux
// ressources et aux exercices de l'apprenant, sans jeton.
//
// Ce test impose de choisir explicitement : soit la fonction ne sert que des
// données publiques (liste blanche ci-dessous), soit elle est fermée à `anon`
// et appelée en service role après vérification du jeton.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/**
 * Fonctions dont l'exposition anonyme est délibérée : elles ne renvoient que
 * des données déjà publiées (catalogue de formations, indicateurs affichés sur
 * les fiches publiques).
 */
const PUBLIQUES_ASSUMEES = new Set([
  'public.get_published_formation',
  'public.get_published_formation_full',
  'public.get_published_formation_indicators',
  'public.list_published_formations',
]);

/** `GRANT EXECUTE ON FUNCTION <schema>.<nom>(<args>) TO ... anon ...` */
const GRANT = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+([\w.]+)\s*\([^)]*\)\s+TO\s+([^;]+);/gi;
const REVOKE = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+([\w.]+)\s*\([^)]*\)\s+FROM\s+([^;]+);/gi;

describe('exposition anonyme des fonctions SQL', () => {
  it('aucune RPC non publique n’est exécutable par anon', () => {
    const fichiers = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    const ouvertes = new Set<string>();

    // Les migrations sont rejouées dans l'ordre : un REVOKE ultérieur referme un
    // GRANT antérieur.
    for (const f of fichiers) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8');
      for (const [, nom, roles] of sql.matchAll(GRANT)) {
        if (/\banon\b/.test(roles!)) ouvertes.add(nom!);
      }
      for (const [, nom, roles] of sql.matchAll(REVOKE)) {
        if (/\banon\b/.test(roles!)) ouvertes.delete(nom!);
      }
    }

    const nonAssumees = [...ouvertes].filter((n) => !PUBLIQUES_ASSUMEES.has(n)).sort();

    expect(
      nonAssumees,
      'RPC exécutables anonymement depuis Internet : les fermer, ou les déclarer publiques ci-dessus',
    ).toEqual([]);
  });
});
