// « Je veux ce même genre d'émargement » — la grille vue chez RFC : les
// demi-journées en colonnes, les stagiaires en lignes, une semaine à la fois.
//
// L'écran ne montrait qu'une feuille à la fois, soit une page par demi-journée.
// Sur six semaines et six stagiaires, suivre l'assiduité demandait soixante
// allers-retours. Demande d'Ismael du 22/09/2026.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const LOADER = lire('../features/attendance/queries/load-dossier-grille.ts');
const GRILLE = lire('../app/(dashboard)/dossiers/[id]/emargements/grille.client.tsx');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/emargements/page.tsx');

describe('le chargement', () => {
  it('tient en un nombre fixe de requêtes, quelle que soit la durée', () => {
    // Une requête par séance rendrait l'écran inutilisable dès la deuxième
    // semaine. Sept accès en tout, tous hors boucle : séances, feuilles,
    // stagiaires, signatures, vignettes, liens formateurs, formateurs.
    expect(LOADER.match(/\.from\('/g)?.length).toBeLessThanOrEqual(7);
    // Feuilles et signatures se lisent en lot, par `in`, jamais séance par
    // séance : c'est ce qui rend le compte indépendant de la durée.
    expect(LOADER).toContain(".in('session_id', seanceIds)");
    expect(LOADER).toContain(".in(\n            'attendance_sheet_id',");
  });

  it('prend les stagiaires du dossier par la règle commune', () => {
    // La même que les feuilles et l'espace apprenant : le groupe s'il existe,
    // le titulaire sinon (0186).
    expect(LOADER).toContain("rpc('dossier_apprenants'");
  });

  it('ordonne les colonnes par jour puis par demi-journée', () => {
    expect(LOADER).toContain('ORDRE: Record<string, number> = { morning: 0');
    expect(LOADER).toContain('a.jour.localeCompare(b.jour)');
  });

  it('écarte les séances annulées', () => {
    expect(LOADER).toContain(".neq('status', 'cancelled')");
  });

  it('une lecture en échec n’emporte pas l’écran', () => {
    expect(LOADER).toMatch(/if \(erreurSeances\) \{[\s\S]{0,180}return vide;/);
    expect(LOADER).toContain('const vide: GrilleDossier = { colonnes: [], lignes: [], vignettes: {}, formateurs: [] }');
  });

  it('sert les signatures par URL signées, jamais par URL publique', () => {
    // Le bucket est privé : une URL publique exposerait la signature
    // manuscrite de chaque stagiaire à qui devine le chemin.
    expect(LOADER).toContain("sb.storage.from('signatures').createSignedUrls(");
    expect(LOADER).not.toContain('getPublicUrl');
  });
});

describe('la grille', () => {
  it('se parcourt semaine par semaine', () => {
    expect(GRILLE).toContain('Semaine précéd.');
    expect(GRILLE).toContain('Semaine suiv.');
    expect(GRILLE).toContain('function lundiDe');
  });

  it('s’ouvre sur la semaine en cours quand la formation y est', () => {
    expect(GRILLE).toContain('semaines.findIndex(([lundi]) => lundi >= lundiDe(aujourdHui))');
  });

  it('reprend les gestes existants plutôt que d’en réécrire', () => {
    // markAttendance, markAllPresent et sendSheetLinksAction portent déjà les
    // gardes de rôle et d'organisation.
    expect(GRILLE).toContain('markAttendance({');
    expect(GRILLE).toContain('markAllPresent({');
    expect(GRILLE).toContain('sendSheetLinksAction({');
  });

  it('une case bascule présent / absent', () => {
    expect(GRILLE).toContain("actuel === 'present' ? 'absent' : 'present'");
  });

  it('n’agit pas sur une feuille close', () => {
    expect(GRILLE).toContain('disabled={!peutAgir || c.finalisee || enCours}');
    expect(GRILLE).toContain('{peutAgir && !c.finalisee &&');
  });

  it('renvoie vers la feuille détaillée pour les cas fins', () => {
    // Retard, départ anticipé, justificatif : la grille ne les remplace pas.
    expect(GRILLE).toContain('emargements/${c.sessionId}');
    expect(GRILLE).toContain('ouvrez la demi-journée depuis son entête');
  });

  it('montre la signature elle-même, pas seulement « signé »', () => {
    // C'est la vignette qui fait la preuve en audit : « ✓ Signé » seul ne dit
    // pas de qui est la signature.
    expect(GRILLE).toContain('vignettes[`${l.id}|${c.sheetId}`]');
    expect(GRILLE).toContain('alt={`Signature de ${l.nom}`}');
  });

  it('porte le QR de la demi-journée et la signature du formateur', () => {
    // Les deux gestes de la feuille détaillée que la grille manquait : projeter
    // le QR en salle, et faire signer le formateur.
    expect(GRILLE).toContain('href={`/projection/${c.sheetId}`}');
    expect(GRILLE).toContain("signerKind: 'trainer'");
    expect(GRILLE).toContain('Signer formateur');
  });

  it('ne propose la signature formateur que s’il y en a un', () => {
    expect(GRILLE).toContain('{formateurs.length > 0 && (');
  });

  it('l’écran ne propose les gestes qu’à qui gère l’émargement', () => {
    expect(PAGE).toContain("canManageSection('attendance')");
  });
});
