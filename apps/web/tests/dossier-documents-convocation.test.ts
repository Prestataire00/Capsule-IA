// L'onglet Documents d'un dossier n'offrait aucune convocation, et ses deux
// lignes « convention » étaient indiscernables — celle de l'entreprise et celle
// du stagiaire portaient le même type et des titres voisins (signalé le
// 2026-09-16, capture de DOS-2026-5B372565).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/documents/page.tsx');
const ROUTE = lire('../app/api/dossiers/[id]/convocation.pdf/route.ts');
const BOUTON = lire('../app/(dashboard)/dossiers/[id]/documents/_components/generate-conventions-button.tsx');

describe('convocation depuis le dossier', () => {
  it('une convocation par séance, puisqu’elle est datée', () => {
    expect(PAGE).toContain('convocation.pdf?session=${seance.id}');
    expect(PAGE).toContain('seances.map((seance) =>');
  });

  it('les séances annulées n’en produisent pas', () => {
    expect(PAGE).toContain(".neq('status', 'cancelled')");
  });

  it('ne filtre pas sur un `deleted_at` que `app.sessions` n’a pas', () => {
    const chargement = PAGE.slice(PAGE.indexOf('const [liensRes'), PAGE.indexOf('const [docsRes'));
    expect(chargement).not.toContain("is('deleted_at', null)");
  });

  it('sans séance, l’écran dit quoi faire au lieu de n’afficher rien', () => {
    expect(PAGE).toContain('La convocation demande une séance');
  });

  it('est archivée, donc envoyable par e-mail comme les autres', () => {
    expect(ROUTE).toContain('persistGeneratedDocument');
    expect(ROUTE).toContain("kind: 'convocation'");
    expect(ROUTE).toContain('sourceKey: `convocation:${params.id}:${sessionId}`');
  });
});

describe('entreprise ou stagiaire, dit à l’écran', () => {
  it('chaque convention générée porte son destinataire', () => {
    expect(PAGE).toContain("entreprise: { label: 'Entreprise'");
    expect(PAGE).toContain("stagiaire: { label: 'Stagiaire'");
  });

  it('les conventions groupées d’avant `audience` restent reconnues', () => {
    expect(PAGE).toContain("m?.audience ?? (m?.grouped ? 'entreprise' : '')");
  });

  it('le bouton du dossier annonce l’exemplaire qu’il produit', () => {
    expect(BOUTON).toContain('Conventions du stagiaire');
  });

  it('celui de l’entreprise se prend sur la séance, et la page y renvoie', () => {
    expect(PAGE).toContain('/sessions/${seances[0].id}/documents');
    expect(PAGE).toContain("Convention de l&apos;entreprise");
  });
});
