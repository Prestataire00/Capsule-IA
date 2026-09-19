import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import {
  extractConvention,
  MAX_FILES,
  MAX_PDF_BYTES,
  MAX_TOTAL_BYTES,
} from '@/features/import/extract-convention';
import { quotaDisponible, tropDeRequetes } from '@/shared/lib/http/rate-limit';

export const dynamic = 'force-dynamic';
// La lecture de plusieurs PDF par le modèle dépasse largement le défaut.
export const maxDuration = 300;

/**
 * Lecture d'une convention et de ses annexes : renvoie ce qui a été compris,
 * sans rien créer. La création se fait après relecture (route `apply`).
 *
 * Passe par une route plutôt qu'une Server Action : les Server Actions sont
 * bornées à 5 Mo de corps, or on reçoit plusieurs PDF.
 */
export async function POST(req: NextRequest) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'catalogue') !== 'manage') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Chaque appel lit jusqu'à 20 Mo de PDF avec le modèle le plus cher : un
  // compte maladroit — ou compromis — ne doit pas pouvoir boucler dessus.
  if (!(await quotaDisponible('importIa', membre.organizationId))) {
    return tropDeRequetes('importIa');
  }

  const form = await req.formData();
  const fichiers = form.getAll('files').filter((f): f is File => f instanceof File);
  if (fichiers.length === 0) return NextResponse.json({ error: 'no_file' }, { status: 400 });
  if (fichiers.length > MAX_FILES) return NextResponse.json({ error: 'too_many_files' }, { status: 400 });

  let total = 0;
  const pdfs: { name: string; base64: string }[] = [];
  for (const f of fichiers) {
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      return NextResponse.json({ error: 'not_pdf', file: f.name }, { status: 400 });
    }
    if (f.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'file_too_large', file: f.name }, { status: 400 });
    total += f.size;
    if (total > MAX_TOTAL_BYTES) return NextResponse.json({ error: 'total_too_large' }, { status: 400 });
    pdfs.push({ name: f.name, base64: Buffer.from(await f.arrayBuffer()).toString('base64') });
  }

  const res = await extractConvention(pdfs);
  if (!res.ok) {
    return NextResponse.json({ error: res.reason }, { status: res.reason === 'no_api_key' ? 503 : 502 });
  }
  return NextResponse.json({ ok: true, data: res.data });
}
