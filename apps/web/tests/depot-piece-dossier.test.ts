// « Je dois pouvoir déposer n'importe quel doc dans le dossier client et
// préciser de quel document il s'agit pour le côté Qualiopi. »
//
// L'onglet Documents ne savait que GÉNÉRER : aucun champ fichier. Le guidage
// Qualiopi y renvoyait pourtant pour « ajouter la preuve » — un lien qui ne
// menait nulle part. Et déposer un fichier dans app.documents ne cochait aucun
// indicateur : seule une ligne qualiopi_proofs de portée « dossier » le fait,
// qu'aucune interface ne savait créer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ROUTE = lire('../app/api/dossiers/[id]/documents/upload/route.ts');
const ECRAN = lire('../app/(dashboard)/dossiers/[id]/documents/deposer-piece.client.tsx');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/documents/page.tsx');
const SQL = lire('../../../supabase/migrations/0188_bucket_documents_pieces_deposees.sql');

describe('le dépôt lui-même', () => {
  it('passe par une route dédiée, pas par une Server Action', () => {
    // Celles-ci sont bornées à 5 Mo : une attestation scannée les dépasse.
    expect(ECRAN).toContain('/documents/upload');
    expect(ECRAN).toContain("method: 'POST'");
    expect(ROUTE).toContain('export async function POST');
  });

  it('vérifie le rôle ET que le dossier est bien de l’organisme', () => {
    // L'identifiant vient de l'URL : il ne prouve rien par lui-même.
    expect(ROUTE).toContain("can(membre.role, 'dossiers') !== 'manage'");
    expect(ROUTE).toContain("eq('organization_id', membre.organizationId)");
  });

  it('borne la taille et le type du fichier', () => {
    expect(ROUTE).toContain('PROOF_MAX_BYTES');
    expect(ROUTE).toContain('PROOF_MIME_TYPES');
  });

  it('n’accepte qu’un type de document connu', () => {
    expect(ROUTE).toContain('TEMPLATE_KINDS as readonly string[]).includes(kind)');
  });

  it('ne laisse pas de fichier orphelin si l’enregistrement échoue', () => {
    // Sinon il resterait seul dans le stockage, invisible et introuvable.
    expect(ROUTE).toMatch(/if \(erreurLigne \|\| !doc\) \{[\s\S]{0,200}storage[\s\S]{0,80}\.remove\(\[chemin\]\)/);
  });

  it('range la pièce dans le dossier, pas dans la bibliothèque globale', () => {
    // Le téléversement existant forçait `dossier_id: null`.
    expect(ROUTE).toContain('dossier_id: params.id');
    expect(ROUTE).not.toContain('dossier_id: null');
  });
});

describe('le rattachement Qualiopi', () => {
  it('crée une preuve de portée dossier, seule forme qui coche un indicateur', () => {
    expect(ROUTE).toContain("from('qualiopi_proofs')");
    expect(ROUTE).toContain("scope: 'dossier'");
    expect(ROUTE).toContain('document_id: documentId');
  });

  it('refuse un indicateur qui n’est pas de portée dossier', () => {
    // La contrainte de la table l'exigerait de toute façon ; mieux vaut le dire
    // avant que la base ne le refuse.
    expect(ROUTE).toContain("ind?.scope === 'dossier'");
  });

  it('un échec de rattachement ne perd pas la pièce', () => {
    expect(ROUTE).toMatch(/if \(erreurPreuve\) console\.error/);
  });

  it('l’écran ne propose que les indicateurs du référentiel en vigueur', () => {
    // Deux versions coexistent pendant la transition : sans ce filtre, chaque
    // indicateur apparaîtrait deux fois.
    expect(PAGE).toContain("is('effective_until', null)");
    expect(PAGE).toContain("eq('scope', 'dossier')");
  });
});

describe('le stockage', () => {
  it('accepte enfin autre chose que du PDF', () => {
    // Ce qu'un client transmet arrive en photo, en Word ou en tableur — et
    // l'écran de la bibliothèque le promettait déjà, sans que ça marche.
    expect(SQL).toContain("UPDATE storage.buckets");
    for (const mime of ['image/jpeg', 'image/png', 'text/plain']) expect(SQL).toContain(mime);
  });

  it('distingue une pièce déposée d’un document généré', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS uploaded_by');
    expect(ROUTE).toContain('uploaded_by: membre.userId');
  });
});
