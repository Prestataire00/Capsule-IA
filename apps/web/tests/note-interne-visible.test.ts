// « Quand on met une note dans un dossier ça ne se voit pas, faut faire
// modifier pour voir les notes » — Ismael, 23/09/2026.
//
// Le formulaire de demande porte un champ « Note interne » : ce qu'on écrit
// pendant l'appel, le contexte, l'interlocuteur, une contrainte. Il s'enregistre
// bien (`prospects.message`), mais la fiche ne le relisait même pas — il fallait
// rouvrir « Modifier » pour le retrouver. Et il s'arrêtait là : la conversion
// ne le reportait pas sur le dossier, si bien que la note disparaissait au
// moment précis où le dossier commençait à servir.
//
// Le formateur, lui, voyait déjà `dossiers.notes` dans son espace. L'organisme,
// nulle part.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const FICHE_DEMANDE = lire('app/(dashboard)/prospects/[id]/page.tsx');
const FORMULAIRE = lire('app/(dashboard)/prospects/nouvelle/demande-form.client.tsx');
const CONVERSION = lire('features/crm/prospect-conversion/convert-core.ts');
const FICHE_DOSSIER = lire('app/(dashboard)/dossiers/[id]/page.tsx');
const ESPACE_FORMATEUR = lire('app/(formateur)/mes-dossiers/[id]/page.tsx');

describe('la note interne de la demande', () => {
  it('est bien saisie sous ce nom', () => {
    // Si le libellé change, les tests suivants perdent leur sujet.
    expect(FORMULAIRE).toContain('Note interne');
    expect(FORMULAIRE).toContain("value={form.message}");
  });

  it('est relue par la fiche, et non seulement par le formulaire', () => {
    // C'était la cause exacte : `message` ne figurait pas dans le select.
    expect(FICHE_DEMANDE).toMatch(/needs_analysis, message, created_at/);
  });

  it('s’affiche sur la fiche', () => {
    expect(FICHE_DEMANDE).toContain('{prospect.message}');
    expect(FICHE_DEMANDE).toMatch(/Note interne/);
  });
});

describe('la conversion en dossier', () => {
  it('lit la note de la demande', () => {
    expect(CONVERSION).toMatch(/custom_formation_price_cents, message'/);
  });

  it('la reporte sur le dossier', () => {
    expect(CONVERSION).toContain("const noteInterne = (p.message ?? '').trim() || null;");
    expect(CONVERSION).toContain('notes: noteInterne,');
  });
});

describe('la fiche du dossier', () => {
  it('lit la note', () => {
    // Elle vient de la demande, ou de l'import d'une convention — qui y écrit
    // l'objet, la sanction et le lieu.
    expect(FICHE_DOSSIER).toMatch(/company_id, contact_id, notes'/);
  });

  it('l’affiche', () => {
    expect(FICHE_DOSSIER).toContain('{notes}');
    expect(FICHE_DOSSIER).toContain('Note interne');
  });

  it('montre enfin à l’organisme ce que le formateur voyait déjà', () => {
    // L'asymétrie était le signe le plus net du défaut.
    expect(ESPACE_FORMATEUR).toContain('{notes}');
  });
});
