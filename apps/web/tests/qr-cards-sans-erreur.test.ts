// « QR personnels à imprimer » ouvrait un onglet sur `{"error":"aucun_qr_a_
// imprimer"}`, en 404. Signalé le 22/09/2026 sur la séance « Groupe A (matin)
// — 28/09/2026 », dont le seul stagiaire attendu avait déjà signé.
//
// Rien à imprimer n'est pourtant pas une panne : c'est le cas normal d'une
// demi-journée émargée. Un plein écran d'erreur pour une bonne nouvelle, qui
// laissait croire la fonction cassée.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = fs.readFileSync(
  path.resolve(__dirname, '../app/api/attendance/sessions/[sessionId]/qr-cards/route.ts'),
  'utf-8',
);

describe('la planche de QR', () => {
  it('ne répond plus en JSON : l’onglet s’ouvre en pleine page', () => {
    expect(ROUTE).not.toContain('NextResponse.json(');
    expect(ROUTE).toContain("'Content-Type': 'text/html; charset=utf-8'");
  });

  it('ne traite plus « rien à imprimer » comme une erreur', () => {
    // Le 404 disait « cette page n'existe pas » d'une demande parfaitement
    // valide, à laquelle la réponse est simplement « il n'y a rien ».
    expect(ROUTE).not.toContain("error: 'aucun_qr_a_imprimer'");
    expect(ROUTE).toContain('Tout le monde a signé');
  });

  it('distingue « tous ont signé » de « personne n’est inscrit »', () => {
    // Les deux appellent un geste différent : attendre, ou rattacher les
    // stagiaires au dossier.
    expect(ROUTE).toContain('let attendus = 0;');
    expect(ROUTE).toContain('Aucun stagiaire inscrit');
    expect(ROUTE).toMatch(/attendus === 0\s*\n?\s*\?/);
  });

  it('accorde le singulier', () => {
    expect(ROUTE).toContain('Le seul stagiaire attendu');
  });

  it('ramène à la feuille plutôt que de laisser dans une impasse', () => {
    expect(ROUTE).toContain('const retour = `/sessions/${params.sessionId}/emargements`');
    expect(ROUTE).toContain('Revenir à la feuille d’émargement');
  });

  it('dit ce qu’il manque quand l’adresse publique n’est pas configurée', () => {
    // Le QR ne porte qu'un lien : sans PUBLIC_APP_URL, il ne mène nulle part.
    expect(ROUTE).toContain('Adresse publique non configurée');
    expect(ROUTE).toContain('PUBLIC_APP_URL');
  });
});
