import { NextResponse } from 'next/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { SUPPORT_BUCKET } from '@/features/trainer-space/session-resources';
import { peutValiderPourMembre } from '@/features/trainer-space/validation-recipients';
import { estPdf, nomDeFichier, supportFichier } from '@/features/pedagogie/support-fichiers';
import { MAX_PDF_TRANSCRIPTION, transcrirePdf } from '@/features/pedagogie/transcrire-pdf';
import { construireDocx, docxEnBuffer } from '@/features/pedagogie/docx-blocs';

/**
 * Le support PDF d'un formateur, en Word, pour l'annoter. Converti une fois
 * puis gardé (0205) : la conversion lit tout le document et prend du temps.
 * Réservé à ceux qui valident les contenus.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fichier(contenu: Buffer, titre: string) {
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      'Content-Type': DOCX,
      'Content-Disposition': `attachment; filename="${nomDeFichier(titre, 'docx')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentMember();
  if (!me || !(await peutValiderPourMembre(me))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const support = await supportFichier(params.id);
  if (!support || support.organizationId !== me.organizationId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!estPdf(support) || !support.storagePath) {
    return NextResponse.json({ error: 'Seul un support PDF se convertit en Word.' }, { status: 400 });
  }

  const stockage = supabaseAdmin().storage.from(SUPPORT_BUCKET);
  if (support.wordPath) {
    const { data } = await stockage.download(support.wordPath);
    if (data) return fichier(Buffer.from(await data.arrayBuffer()), support.title);
  }

  const { data: pdf, error } = await stockage.download(support.storagePath);
  if (error || !pdf) return NextResponse.json({ error: 'Le PDF est introuvable.' }, { status: 404 });
  const octets = Buffer.from(await pdf.arrayBuffer());
  if (octets.length > MAX_PDF_TRANSCRIPTION) {
    return NextResponse.json({ error: 'PDF trop volumineux pour être converti (30 Mo au plus).' }, { status: 413 });
  }

  const transcription = await transcrirePdf(octets.toString('base64'));
  if (!transcription.ok) {
    return NextResponse.json(
      { error: transcription.reason === 'no_api_key' ? 'La conversion n’est pas configurée.' : 'La conversion a échoué. Réessayez.' },
      { status: 502 },
    );
  }

  const docx = await docxEnBuffer(
    construireDocx({ titre: support.title, source: support.storagePath.split('/').pop() ?? support.title, blocs: transcription.blocs }),
  );
  const chemin = `${support.storagePath}.annotable.docx`;
  const { error: erreurDepot } = await stockage.upload(chemin, docx, { contentType: DOCX, upsert: true });
  if (erreurDepot) console.error('[supports] conversion Word non gardée', support.id, erreurDepot.message);
  else {
    const { error: erreurMaj } = await supabaseAdmin()
      .schema('app')
      .from('session_resources' as never)
      .update({ word_path: chemin } as never)
      .eq('id', support.id);
    if (erreurMaj) console.error('[supports] chemin Word non noté', support.id, erreurMaj.message);
  }
  return fichier(docx, support.title);
}
