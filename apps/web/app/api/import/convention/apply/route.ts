import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { normalizeImport } from '@/features/import/convention-types';
import { applyConventionImport } from '@/features/import/apply-convention';
import { MAX_FILES, MAX_PDF_BYTES, MAX_TOTAL_BYTES } from '@/features/import/extract-convention';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Création dans le CRM de ce que l'utilisateur vient de relire : client,
 * formation, séances, tâche. L'écriture se fait en service role, donc après
 * vérification explicite du rôle ; tout est borné à l'organisation du membre,
 * jamais à une valeur reçue du client.
 */
export async function POST(req: NextRequest) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'catalogue') !== 'manage') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await req.formData();
  const brut = form.get('payload');
  if (typeof brut !== 'string') return NextResponse.json({ error: 'no_payload' }, { status: 400 });

  let payload;
  try {
    payload = normalizeImport(JSON.parse(brut));
  } catch {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }

  // PDF d'origine, facultatifs : l'archivage ne doit pas empêcher la création.
  const pdfs: { name: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const f of form.getAll('files').filter((x): x is File => x instanceof File).slice(0, MAX_FILES)) {
    if (f.size > MAX_PDF_BYTES) continue;
    total += f.size;
    if (total > MAX_TOTAL_BYTES) break;
    pdfs.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin() as unknown as SupabaseClient<any, any, any>;
    const summary = await applyConventionImport(sb, {
      organizationId: membre.organizationId,
      userId: membre.userId,
      payload,
      pdfs,
    });
    // Sans cela, les listes servaient encore leur version en cache : le client
    // et les séances venaient d'être créés mais n'apparaissaient nulle part.
    for (const p of ['/entreprises', '/formations', '/sessions', '/taches', '/agenda', '/documents']) {
      revalidatePath(p);
    }
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.error('[import convention] création impossible', e);
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 });
  }
}
