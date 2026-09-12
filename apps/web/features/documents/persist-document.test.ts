import { describe, it, expect, vi } from 'vitest';
import { persistGeneratedDocument } from './persist-document';

/** Client minimal : une lecture (document courant existant ou non) + insert + upload. */
function makeSb(existing: Record<string, unknown> | null) {
  const insert = vi.fn().mockResolvedValue({ data: { id: 'doc-new' }, error: null });
  const update = vi.fn().mockResolvedValue({ error: null });
  const upload = vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null });
  const maybeSingle = () => Promise.resolve({ data: existing, error: null });
  // Chaîne de filtres tolérante : chaque appel renvoie le même objet.
  const chain: Record<string, unknown> = {};
  for (const k of ['eq', 'is', 'select', 'order', 'limit']) chain[k] = () => chain;
  chain.maybeSingle = maybeSingle;
  const sb = {
    schema: () => ({
      from: () => ({
        select: () => chain,
        insert: () => ({ select: () => ({ single: () => insert() }) }),
        update: () => ({ eq: () => update() }),
      }),
    }),
    storage: { from: () => ({ upload }) },
  };
  return { sb, insert, update, upload };
}

const args = {
  organizationId: 'org1',
  dossierId: 'dos1',
  kind: 'convention',
  title: 'Convention',
  bytes: new TextEncoder().encode('pdf'),
  generationInput: { a: 1 },
};

describe('persistGeneratedDocument', () => {
  it('insère un document quand le fichier est nouveau', async () => {
    const { sb, insert, upload } = makeSb(null);
    const r = await persistGeneratedDocument(sb as never, args);
    expect(r).toMatchObject({ created: true, version: 1 });
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it('sans clé de source : ne réarchive pas un fichier identique', async () => {
    const { sb, insert, upload } = makeSb({ id: 'doc-existing', version: 1 });
    const r = await persistGeneratedDocument(sb as never, args);
    expect(r).toMatchObject({ documentId: 'doc-existing', created: false });
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('même source, contenu inchangé : aucune nouvelle version', async () => {
    // Empreinte de « pdf » telle que calculée par sha256Hex.
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(Buffer.from('pdf')).digest('hex');
    const { sb, insert, upload, update } = makeSb({ id: 'doc-1', version: 3, parent_document_id: null, file_hash: hash });
    const r = await persistGeneratedDocument(sb as never, { ...args, sourceKey: 'convention:dos1' });
    expect(r).toEqual({ documentId: 'doc-1', created: false, version: 3 });
    expect(update).toHaveBeenCalledOnce(); // rafraîchit le titre
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('même source, contenu modifié : nouvelle version, l’ancienne est archivée', async () => {
    const { sb, insert, upload, update } = makeSb({
      id: 'doc-1',
      version: 2,
      parent_document_id: null,
      file_hash: 'autre-empreinte',
    });
    const r = await persistGeneratedDocument(sb as never, { ...args, sourceKey: 'convention:dos1' });
    expect(r).toMatchObject({ created: true, version: 3 });
    expect(update).toHaveBeenCalledOnce(); // l'ancienne version sort de la bibliothèque
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });
});
