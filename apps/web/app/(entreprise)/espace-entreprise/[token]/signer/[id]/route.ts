import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { publicOrigin } from '@/shared/lib/http/public-origin';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { generateDocumentSignatureToken } from '@/shared/lib/document-signature-token';
import { signatureDuReferent } from '@/features/espace-entreprise/acces-referent';

/**
 * « Signer » depuis l'espace entreprise : un lien de signature neuf, puis la
 * page de signature habituelle. Le lien reçu par e-mail cesse de valoir — il
 * n'y a qu'une signature, quel que soit le chemin.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const s = await signatureDuReferent(lien.value.contactId, lien.value.organizationId, params.id);
  if (!s) return NextResponse.redirect(new URL(`/espace-entreprise/${params.token}?onglet=actions`, publicOrigin(req)));

  const { token } = await generateDocumentSignatureToken({ signatureId: params.id, documentId: s.documentId, organizationId: lien.value.organizationId });
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('document_signatures')
    .update({ request_token_hash: createHash('sha256').update(token).digest('hex') } as never)
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  return NextResponse.redirect(new URL(`/signer/document/${token}`, publicOrigin(req)));
}
