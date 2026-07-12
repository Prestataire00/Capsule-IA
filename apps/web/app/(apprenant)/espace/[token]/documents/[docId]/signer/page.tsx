// ARCHETYPE: workflow
// Justification: l'apprenant signe un document (convention…) depuis son espace —
// signature horodatée dans document_signatures, réutilise le canvas de signature.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, ShieldCheck, ExternalLink, Check } from 'lucide-react';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
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
  const { data: doc } = await admin
    .schema('app')
    .from('documents')
    .select('id, dossier_id, kind, title')
    .eq('id', params.docId)
    .is('deleted_at', null)
    .maybeSingle();
  const document = doc as { dossier_id: string; kind: string; title: string | null } | null;

  if (
    !document ||
    document.dossier_id !== verified.value.dossierId ||
    !SIGNABLE_DOCUMENT_KINDS.has(document.kind)
  ) {
    return notFound();
  }

  const { data: existing } = await admin
    .schema('app')
    .from('document_signatures')
    .select('status')
    .eq('document_id', params.docId)
    .eq('signer_learner_id', verified.value.learnerId)
    .maybeSingle();
  const alreadySigned = (existing as { status: string } | null)?.status === 'signed';

  const back = `/espace/${params.token}/documents`;
  const title = document.title ?? DOC_TITLE[document.kind] ?? 'Document';
  const readHref = DOC_HREF[document.kind]?.(verified.value.dossierId) ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <Link href={back} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Mes documents
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950/60 dark:to-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-center shadow-sm">
          <FileText className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{title}</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Signature électronique depuis votre espace.</p>
        </div>
      </header>

      {readHref && (
        <a
          href={readHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium mb-4"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Lire le document avant de signer
        </a>
      )}

      {alreadySigned ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Document déjà signé</h2>
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
