// ARCHETYPE: workflow
// Justification: l'apprenant signe un document (convention…) depuis son espace —
// signature horodatée dans document_signatures, réutilise le canvas de signature.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, ShieldCheck, ExternalLink, Check } from 'lucide-react';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { DocumentSignerForm } from './document-signer-form';
import { SIGNABLE_DOCUMENT_KINDS } from './signable';

export const dynamic = 'force-dynamic';

const DOC_TITLE: Record<string, string> = {
  convention: 'Convention de formation',
};

const DOC_HREF: Record<string, (dossierId: string) => string> = {
  convention: (d) => `/api/dossiers/${d}/convention.pdf`,
};

export default async function SignDocumentPage({ params }: { params: { token: string; docId: string } }) {
  const verified = await verifyApprenantToken(params.token);
  if (!verified.ok) return notFound();

  const admin = supabaseAdmin();
  const { data: doc, error: erreurDocument } = await admin
    .schema('app')
    .from('documents')
    .select('id, dossier_id, kind, title')
    .eq('id', params.docId)
    .is('deleted_at', null)
    .maybeSingle();
  // Une panne rendait la page introuvable : l'apprenant croyait le document
  // retiré et ne signait pas.
  exigerLecture('document à signer', erreurDocument);
  const document = doc as { dossier_id: string; kind: string; title: string | null } | null;

  if (
    !document ||
    document.dossier_id !== verified.value.dossierId ||
    !SIGNABLE_DOCUMENT_KINDS.has(document.kind)
  ) {
    return notFound();
  }

  const { data: existing, error: erreurSignature } = await admin
    .schema('app')
    .from('document_signatures')
    .select('status')
    .eq('document_id', params.docId)
    .eq('signer_learner_id', verified.value.learnerId)
    .maybeSingle();
  // Illisible, la signature existante repasserait pour absente : on
  // redemanderait à l'apprenant de signer ce qu'il a déjà signé.
  exigerLecture('signature du document', erreurSignature);
  const alreadySigned = (existing as { status: string } | null)?.status === 'signed';

  const back = `/espace/${params.token}/documents`;
  const title = document.title ?? DOC_TITLE[document.kind] ?? 'Document';
  const readHref = DOC_HREF[document.kind]?.(verified.value.dossierId) ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <Link href={back} className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Mes documents
      </Link>

      <header className="mb-6 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/40 dark:to-zinc-900 px-5 py-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl grid place-items-center text-white shadow-md shrink-0 bg-orange-500 shadow-orange-500/30">
          <FileText className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-[24px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">{title}</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Signature électronique depuis votre espace.</p>
        </div>
      </header>

      {readHref && (
        <a
          href={readHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] text-orange-600 dark:text-orange-400 hover:text-orange-700 font-semibold mb-4"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Lire le document avant de signer
        </a>
      )}

      {alreadySigned ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
          <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
          <h2 className="text-[17px] font-bold text-zinc-900 dark:text-zinc-100 mb-2">Document déjà signé</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Vous avez déjà signé ce document. Merci !</p>
        </div>
      ) : (
        <DocumentSignerForm token={params.token} docId={params.docId} backHref={back} />
      )}

      <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400 mt-6 inline-flex items-center justify-center gap-1.5 w-full">
        <ShieldCheck className="w-3 h-3" />
        Signature horodatée, liée à votre IP et à un hash cryptographique (preuve Qualiopi).
      </p>
    </div>
  );
}
