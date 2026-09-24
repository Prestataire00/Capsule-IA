// « Les documents doivent être adaptés à chaque groupe » — Ismael, 24/09/2026,
// qui a choisi « les deux, au choix au moment de générer » : la convention du
// dossier reste, celle du groupe s'ajoute.
//
// Une seule convention pour seize personnes réparties en deux groupes annonce
// des dates et un volume horaire qu'aucun des deux ne suit réellement.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const BUILDER = lire('../features/documents/build-convention-groupe.ts');
const ROUTE = lire('../app/api/dossiers/[id]/convention.pdf/route.ts');
const ECRAN = lire('../app/(dashboard)/dossiers/[id]/documents/page.tsx');

describe('ce que la convention de groupe change', () => {
  it('la liste nominative : ses stagiaires, et eux seuls', () => {
    expect(BUILDER).toContain("from('dossier_groupe_membres')");
    expect(BUILDER).toContain('participants,');
  });

  it('les dates, prises sur les séances du groupe', () => {
    // Le dossier court du premier au dernier jour, tous groupes confondus :
    // annoncer cette période au Groupe A l'engagerait sur des journées où il
    // n'est pas attendu.
    expect(BUILDER).toContain("eq('groupe_id', groupeId)");
    expect(BUILDER).toContain('dossier.startDate = seances[0]!.starts_at.slice(0, 10)');
  });

  it('et le volume horaire, qui doit correspondre à ce qui est signé', () => {
    expect(BUILDER).toContain('if (heures > 0) dossier.totalHours = heures;');
  });

  it('sans séance rattachée, on garde celles du dossier', () => {
    // Mieux vaut la période large que pas de date du tout.
    expect(BUILDER).toContain('if (seances.length > 0) {');
  });

  it('et rien d’autre : le reste est celui du dossier', () => {
    // Prestataire, client, programme, tarif : rien de tout cela ne dépend du
    // groupe, et le recalculer aurait été autant d'occasions de diverger.
    expect(BUILDER).toContain('const built = await buildConventionInput(sb as never, dossierId, payer);');
    expect(BUILDER).toContain('...built.input,');
  });

  it('l’exemplaire est celui de l’entreprise, même pour un groupe d’un seul', () => {
    // Le déduire du nombre de participants aurait produit un exemplaire
    // « stagiaire » sur un groupe réduit à une personne.
    expect(BUILDER).toContain("audience: 'entreprise' as const");
  });
});

describe('l’archivage ne confond pas deux groupes', () => {
  it('le groupe entre dans la clé', () => {
    // Sans lui, la convention du Groupe B écraserait celle du Groupe A — même
    // dossier, même payeur — et l'écrasement ne se verrait qu'à l'ouverture du
    // PDF.
    expect(ROUTE).toContain("sourceKey: `convention:${params.id}:${selected?.payer ?? 'reste'}${groupeParam ? `:${groupeParam}` : ''}`");
  });

  it('et le document porte le nom du groupe', () => {
    expect(ROUTE).toContain('${groupe ? ` — ${groupe.nomGroupe}` : \'\'}');
    expect(ROUTE).toContain('groupe_nom: groupe.nomGroupe');
  });
});

describe('le choix au moment de générer', () => {
  it('un bouton par groupe, à côté de celui du dossier', () => {
    expect(ECRAN).toContain('Convention — {g.nom}');
    expect(ECRAN).toContain('convention.pdf?groupe=${g.id}');
  });

  it('et aucun bouton quand le dossier n’a pas de groupe', () => {
    // `groupesDuDossier` est vide : la boucle ne rend rien, sans condition à
    // maintenir.
    expect(ECRAN).toContain('groupesDuDossier.map((g) => (');
  });

  it('la convention du dossier est inchangée sans le paramètre', () => {
    expect(ROUTE).toContain('const built = groupe ?? (await buildConventionInput(sb, params.id, selected));');
  });

  it('un groupe inconnu est refusé, pas silencieusement ignoré', () => {
    // Sans cela, une URL erronée aurait rendu la convention du dossier entier
    // en la faisant passer pour celle d'un groupe.
    expect(ROUTE).toContain("return NextResponse.json({ error: 'groupe_not_found' }, { status: 404 });");
  });
});
