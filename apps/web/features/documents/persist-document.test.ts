import { describe, it, expect, vi } from 'vitest';
import { persistGeneratedDocument } from './persist-document';

function makeSb(existing: { id: string } | null) {
  const insert = vi.fn().mockResolvedValue({ data: { id: 'doc-new' }, error: null });
  const upload = vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null });
  const sb = {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({ maybeSingle: () => Promise.resolve({ data: existing, error: null }) }),
            }),
          }),
        }),
        insert: () => ({ select: () => ({ single: () => insert() } ) }),
      }),
    }),
    storage: { from: () => ({ upload }) },
  };
  return { sb, insert, upload };
}

describe('persistGeneratedDocument', () => {
  const args = {
    organizationId: 'org1', dossierId: 'dos1', kind: 'convention',
    title: 'Convention', bytes: new TextEncoder().encode('pdf'), generationInput: { a: 1 },
  };

  it('insère un document quand le hash est nouveau', async () => {
    const { sb, insert, upload } = makeSb(null);
    const r = await persistGeneratedDocument(sb as never, args);
    expect(r.created).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it('no-op idempotent quand le hash existe déjà', async () => {
    const { sb, insert, upload } = makeSb({ id: 'doc-existing' });
    const r = await persistGeneratedDocument(sb as never, args);
    expect(r).toEqual({ documentId: 'doc-existing', created: false });
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
