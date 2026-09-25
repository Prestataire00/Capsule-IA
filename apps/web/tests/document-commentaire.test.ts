// « Mettre un commentaire sur les documents que je dépose » — 25/09/2026.
//
// Ce qu'on sait d'une pièce et que son nom ne dit pas : d'où elle vient, ce
// qu'il manque, ce qu'on attend encore. Faute d'endroit, ces précisions
// finissaient dans l'intitulé — ou nulle part.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { can } from '../shared/lib/auth/permissions';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const DEPOT = lire('../app/(dashboard)/dossiers/[id]/documents/deposer-piece.client.tsx');
const ROUTE = lire('../app/api/dossiers/[id]/documents/upload/route.ts');
const ACTION = lire('../app/(dashboard)/dossiers/[id]/documents/commentaire-actions.ts');
const LISTE = lire('../app/(dashboard)/dossiers/[id]/documents/page.tsx');
const CHAMP = lire('../app/(dashboard)/dossiers/[id]/documents/commentaire.client.tsx');

describe('qui peut commenter', () => {
  // « Le commentaire doit être valable pour Laurie, Faouzi et Ismael » —
  // 25/09/2026. Relevé des membres : Faouzi est propriétaire, Ismael
  // administrateur, Laurie gestionnaire.
  it.each([
    ['Faouzi', 'owner'],
    ['Ismael', 'admin'],
    ['Laurie', 'gestionnaire'],
  ])('%s (%s) écrit et modifie les commentaires', (_qui, role) => {
    expect(can(role, 'dossiers')).toBe('manage');
  });

  it('la garde est bien celle-là, des deux côtés', () => {
    // Une garde côté écran sans garde côté action laisserait passer un appel
    // direct : le middleware ne protège pas les Server Actions.
    expect(ACTION).toContain("guardAction('dossiers')");
    expect(LISTE).toContain("canManageSection('dossiers')");
  });

  it('le formateur le lit sans pouvoir le changer', () => {
    // Il suit l'affaire depuis son espace : lui cacher une note sur une pièce
    // de SON dossier n'aurait servi à rien, la modifier n'est pas son rôle.
    expect(can('formateur', 'dossiers')).toBe('read');
    expect(CHAMP).toContain('peutModifier');
  });

  it('et le commentaire est celui du document, pas celui de son auteur', () => {
    // Écrit par l'un, lu par les deux autres : il vit sur la pièce.
    expect(ACTION).toContain('metadata.commentaire = texte');
    expect(ACTION).not.toMatch(/user_id|par_utilisateur/);
  });
});

describe('au dépôt', () => {
  it('un champ commentaire, facultatif', () => {
    expect(DEPOT).toContain('Commentaire <span className="font-normal text-zinc-400">(facultatif)</span>');
    expect(DEPOT).toContain("fd.set('comment', commentaire.trim())");
  });

  it('et il repart vide après un dépôt réussi', () => {
    // Sinon le commentaire du document précédent se recollerait au suivant.
    expect(DEPOT).toContain("setCommentaire('')");
  });

  it('la route le range dans metadata, sans migration', () => {
    // `metadata` est déjà du JSONB : une colonne pour une note facultative
    // aurait coûté une migration sans rien apporter.
    expect(ROUTE).toContain("String(fd.get('comment') ?? '').trim().slice(0, 1000)");
    expect(ROUTE).toContain('...(commentaire ? { commentaire } : {}),');
  });
});

describe('après coup', () => {
  it('le commentaire se modifie sans redéposer le fichier', () => {
    // Ce qu'on a à dire d'une pièce vient souvent plus tard : la page qui
    // manque, la relance faite.
    expect(ACTION).toContain('export async function commenterDocument');
    expect(CHAMP).toContain('Commenter');
  });

  it('et l’écriture ne perd pas le reste du metadata', () => {
    // Un `update` sur une colonne JSON remplace tout : le nom d'origine du
    // fichier et son type MIME seraient partis avec.
    expect(ACTION).toContain('const metadata = ((doc as { metadata?: Record<string, unknown> | null }).metadata ?? {})');
    expect(ACTION).toContain('metadata.commentaire = texte');
  });

  it('vider le champ retire le commentaire au lieu d’en laisser un vide', () => {
    expect(ACTION).toContain("if (texte === '') delete metadata.commentaire;");
    expect(CHAMP).toContain('Vider le champ retire le commentaire.');
  });

  it('le document doit appartenir au dossier ET à l’organisme', () => {
    // L'identifiant vient de l'écran : sans ces deux filtres, on commenterait
    // la pièce d'un autre client.
    expect(ACTION).toContain("eq('dossier_id', p.data.dossierId)");
    expect(ACTION).toContain("eq('organization_id', garde.member.organizationId)");
  });
});

describe('il se lit sans ouvrir le document', () => {
  it('sous l’intitulé, dans la liste', () => {
    // Une note qu'il faut ouvrir un PDF pour lire ne sert à rien.
    expect(LISTE).toContain('<CommentaireDocument');
    expect(LISTE).toContain('initial={d.metadata?.commentaire ?? null}');
  });

  it('et le texte est rendu tel qu’il a été écrit', () => {
    expect(CHAMP).toContain('whitespace-pre-wrap break-words');
  });
});
