import 'server-only';
// Le programme déposé, mis sous la forme que Claude lit.
//
// Pas de format imposé ni de taille maximale côté application : un PDF ou une
// image partent tels quels — dans la requête s'ils sont petits, par l'API
// Files d'Anthropic sinon (jusqu'à 500 Mo) ; les autres formats y arrivent en
// texte. Le fichier confié à l'API Files est supprimé une fois la proposition
// rédigée.

import { toFile } from '@anthropic-ai/sdk';
import { anthropic } from '@/shared/lib/ai/client';
import { natureDuDocument } from './lire-document';

export const BETA_FILES = 'files-api-2025-04-14';

/** Au-delà, le document passe par l'API Files : une requête est limitée à 32 Mo. */
const MAX_EN_LIGNE_PDF = 20 * 1024 * 1024;
/** Une image en ligne ne doit pas dépasser 5 Mo une fois encodée en base64. */
const MAX_EN_LIGNE_IMAGE = Math.floor((5 * 1024 * 1024 * 3) / 4) - 1024;
const MAX_FILES_API = 500 * 1024 * 1024;
/** Environ 700 000 tokens : au-delà, le programme ne tient pas dans le contexte avec le reste. */
const MAX_TEXTE = 2_500_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlocProgramme = any;

export type ProgrammeLu =
  | { ok: true; bloc: BlocProgramme; betas: string[]; nettoyer: () => Promise<void> }
  | { ok: false; raison: string };

const rien = async () => {};

async function viaFilesApi(octets: Uint8Array, nom: string, mime: string): Promise<{ id: string } | null> {
  const client = anthropic();
  if (!client) return null;
  try {
    const f = await client.beta.files.upload({ file: await toFile(Buffer.from(octets), nom, { type: mime }), betas: [BETA_FILES] });
    return { id: f.id };
  } catch (e) {
    console.error('[proposition] envoi du programme à l’API Files impossible', nom, e);
    return null;
  }
}

const supprimer = (id: string) => async () => {
  const client = anthropic();
  if (!client) return;
  try {
    await client.beta.files.delete(id, { betas: [BETA_FILES] });
  } catch (e) {
    console.error('[proposition] fichier de l’API Files non supprimé', id, e);
  }
};

export async function preparerProgramme(octets: Uint8Array, nom: string): Promise<ProgrammeLu> {
  const titre = nom || 'Programme du formateur';
  const nature = natureDuDocument(octets, nom);

  if (nature.type === 'illisible') return { ok: false, raison: nature.raison };

  if (nature.type === 'texte') {
    if (!nature.texte.trim()) return { ok: false, raison: 'Le document ne contient aucun texte lisible.' };
    if (nature.texte.length > MAX_TEXTE) {
      return { ok: false, raison: 'Le document est trop long pour être lu en une fois par l’IA : déposez la partie programme seule.' };
    }
    return {
      ok: true,
      bloc: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: nature.texte }, title: titre },
      betas: [],
      nettoyer: rien,
    };
  }

  const mime = nature.type === 'pdf' ? 'application/pdf' : nature.media;
  const enLigne = nature.type === 'pdf' ? octets.length <= MAX_EN_LIGNE_PDF : octets.length <= MAX_EN_LIGNE_IMAGE;
  if (enLigne) {
    const data = Buffer.from(octets).toString('base64');
    return {
      ok: true,
      bloc:
        nature.type === 'pdf'
          ? { type: 'document', source: { type: 'base64', media_type: mime, data }, title: titre }
          : { type: 'image', source: { type: 'base64', media_type: mime, data } },
      betas: [],
      nettoyer: rien,
    };
  }

  if (octets.length > MAX_FILES_API) return { ok: false, raison: 'Le document dépasse 500 Mo : l’IA ne peut pas le lire. Déposez la partie programme seule.' };
  const f = await viaFilesApi(octets, nom || 'programme', mime);
  if (!f) return { ok: false, raison: 'Le document n’a pas pu être transmis à l’IA. Réessayez dans un instant.' };
  return {
    ok: true,
    bloc: nature.type === 'pdf' ? { type: 'document', source: { type: 'file', file_id: f.id }, title: titre } : { type: 'image', source: { type: 'file', file_id: f.id } },
    betas: [BETA_FILES],
    nettoyer: supprimer(f.id),
  };
}
