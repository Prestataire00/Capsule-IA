// Suite de l'incident du 21/09/2026, côté chargeurs.
//
// Les pages savaient distinguer « la fiche n'existe pas » de « la lecture a
// échoué ». Les chargeurs qu'elles appellent, non : `loadSession`, les gardes
// de l'espace formateur et les contextes de l'espace apprenant rendaient `null`
// dans les deux cas. Une cinquantaine de pages héritaient donc du défaut sans
// le porter dans leur code — et leur `notFound()` était correct, c'est la
// réponse du chargeur qui mentait.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { exigerLecture } from '../shared/lib/supabase/echec-lecture';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

/**
 * Les chargeurs dont une page fait un 404 : leur `null` doit vouloir dire
 * l'absence, et rien d'autre.
 */
const CHARGEURS: ReadonlyArray<readonly [string, string]> = [
  ['features/sessions/load-session.ts', 'vingt pages de séance'],
  ['features/trainer-space/guard.ts', 'six pages de l’espace formateur'],
  ['features/trainer-space/my-dossiers.ts', 'les dossiers confiés au formateur'],
  ['features/trainer-space/billing.ts', 'la facture du formateur'],
  ['features/attendance/access.ts', 'la projection et l’émargement'],
  ['features/formations/programme/load-public.ts', 'le catalogue public'],
  ['app/(apprenant)/espace/[token]/_lib.ts', 'le tableau de bord de l’apprenant'],
  ['app/(apprenant)/espace/[token]/_sessions.ts', 'les séances de l’apprenant'],
  ['app/(apprenant)/espace/[token]/questionnaires.ts', 'les questionnaires de l’apprenant'],
  ['app/(apprenant)/espace/[token]/quiz/_data.ts', 'les quiz de l’apprenant'],
  ['app/(apprenant)/espace/[token]/documents/[docId]/signer/page.tsx', 'la signature d’un document'],
];

describe('exigerLecture', () => {
  afterEach(() => vi.restoreAllMocks());

  it('laisse passer une lecture qui a réussi', () => {
    expect(() => exigerLecture('séance', null)).not.toThrow();
    expect(() => exigerLecture('séance', undefined)).not.toThrow();
  });

  it('lève, et nomme ce qui n’a pas pu être lu', () => {
    expect(() => exigerLecture('séance', { code: '42P01', message: 'relation inexistante' })).toThrow(
      /Lecture impossible \(séance\) : relation inexistante/,
    );
  });

  it('journalise le code de la base, pour le diagnostic', () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => exigerLecture('dossier', { code: 'PGRST201', message: 'jointure ambiguë' })).toThrow();
    expect(journal).toHaveBeenCalledWith('[dossier] lecture impossible', 'PGRST201', 'jointure ambiguë');
  });
});

describe('les chargeurs dont dépend un 404', () => {
  it.each(CHARGEURS)('%s garde sa lecture d’identité (%s)', (fichier) => {
    expect(lire(fichier)).toContain('exigerLecture(');
  });

  it('aucun ne se contente de journaliser puis de rendre null', () => {
    // C'était la forme exacte du défaut : l'erreur était vue, écrite dans les
    // logs, puis effacée du résultat.
    //
    // `verified.error` est exclu : un jeton invalide ou expiré est une vraie
    // absence de droit, pas une panne de lecture, et « ce lien n'est plus
    // valable » y est la bonne réponse.
    const DEFAUT = /console\.(error|warn)\((?:(?!verified\.error)[^;])*\berror\b[^;]*\);\s*\n\s*return (null|\{ ok: false)/;
    for (const [fichier] of CHARGEURS) {
      expect(lire(fichier), fichier).not.toMatch(DEFAUT);
    }
  });

  it('la garde du formateur refuse sur la liste, pas sur une panne', () => {
    // `if (error || !ids.includes(id)) return forbidden` disait au formateur
    // que sa propre séance n'était pas la sienne dès que la RPC échouait.
    const garde = lire('features/trainer-space/guard.ts');
    expect(garde).not.toMatch(/if \(error \|\|/);
    expect(garde).toContain("exigerLecture('séances du formateur', error)");
  });
});
