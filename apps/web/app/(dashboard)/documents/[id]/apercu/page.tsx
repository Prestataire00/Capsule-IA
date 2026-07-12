// ARCHETYPE: command
// Justification: aperçu imprimable + demande de signature d'un document.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { PrintButton } from './_components/print-button';
import {
  SignaturePanel,
  type ExistingSignature,
  type SignerSuggestion,
} from './_components/signature-panel';

export const dynamic = 'force-dynamic';

export default async function DocumentPreviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('documents')
    .select('id, title, content_html, dossier_id, storage_path, mime_type')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  const doc = data as unknown as {
    id: string;
    title: string;
    content_html: string | null;
    dossier_id: string | null;
    storage_path: string | null;
    mime_type: string | null;
  } | null;
  if (!doc) notFound();

  // Fichier PDF (pas de HTML inline) → aperçu embarqué dans le navigateur.
  const isPdf = !doc.content_html && !!doc.storage_path;

  const { data: sigData } = await sb
    .schema('app')
    .from('document_signatures')
    .select('signer_name, signer_email, signer_kind, status, signed_at')
    .eq('document_id', doc.id)
    .order('created_at', { ascending: true });
  const existing =
    ((sigData as unknown as Array<{
      signer_name: string | null;
      signer_email: string | null;
      signer_kind: string;
      status: string;
      signed_at: string | null;
    }>) ?? []).map<ExistingSignature>((s) => ({
      signerName: s.signer_name,
      signerEmail: s.signer_email,
      signerKind: s.signer_kind,
      status: s.status,
      signedAt: s.signed_at,
    }));

  // Suggestions de signataires depuis le dossier (apprenant + entreprise).
  const suggestions: SignerSuggestion[] = [];
  if (doc.dossier_id) {
    const { data: dRow } = await sb
      .schema('app')
      .from('dossiers')
      .select('learner:learners(id, first_name, last_name, email), company:companies(name, contact_email)')
      .eq('id', doc.dossier_id)
      .maybeSingle();
    const d = dRow as unknown as {
      learner:
        | { id: string; first_name: string; last_name: string; email: string }
        | { id: string; first_name: string; last_name: string; email: string }[]
        | null;
      company: { name: string; contact_email: string | null } | { name: string; contact_email: string | null }[] | null;
    } | null;
    const learner = d ? (Array.isArray(d.learner) ? d.learner[0] : d.learner) : null;
    const company = d ? (Array.isArray(d.company) ? d.company[0] : d.company) : null;
    if (learner?.email) {
      suggestions.push({
        kind: 'learner',
        name: `${learner.first_name} ${learner.last_name}`,
        email: learner.email,
        learnerId: learner.id,
      });
    }
    if (company?.contact_email) {
      suggestions.push({ kind: 'company_rep', name: company.name, email: company.contact_email, learnerId: null });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900 py-8 px-4">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
        .doc-sheet h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; }
        .doc-sheet h2 { font-size: 15px; font-weight: 600; margin: 18px 0 6px; }
        .doc-sheet h3 { font-size: 13px; font-weight: 600; margin: 14px 0 4px; }
        .doc-sheet p { margin: 8px 0; line-height: 1.55; }
        .doc-sheet ul { margin: 6px 0 6px 18px; list-style: disc; }
        .doc-sheet li { margin: 2px 0; }
        .doc-sheet table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        .doc-sheet th, .doc-sheet td { border: 1px solid #e4e4e7; padding: 6px 9px; text-align: left; vertical-align: top; }
        .doc-sheet th { background: #f4f4f5; font-weight: 600; }
        .doc-sheet .doc-header { font-size: 12px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 18px; }
        .doc-sheet .doc-brand-header img { max-height: 64px; max-width: 200px; object-fit: contain; }
        .doc-sheet .signatures { margin-top: 36px; }
      `}</style>

      <div className={`no-print mx-auto mb-4 flex items-center justify-between ${isPdf ? 'max-w-[900px]' : 'max-w-[760px]'}`}>
        <Link
          href={doc.dossier_id ? `/dossiers/${doc.dossier_id}/documents` : '/documents'}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {doc.dossier_id ? 'Retour au dossier' : 'Retour aux documents'}
        </Link>
        {isPdf ? (
          <a
            href={`/api/documents/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Ouvrir / Télécharger
          </a>
        ) : (
          <PrintButton />
        )}
      </div>

      {isPdf ? (
        <div className="max-w-[900px] mx-auto rounded-sm shadow-lg overflow-hidden bg-white">
          <iframe
            src={`/api/documents/${doc.id}`}
            title={doc.title}
            className="w-full bg-white"
            style={{ height: '85vh', border: 'none' }}
          />
        </div>
      ) : (
        <>
          <article className="doc-sheet bg-white text-zinc-900 max-w-[760px] mx-auto rounded-sm shadow-lg px-12 py-12">
            {doc.content_html ? (
              // eslint-disable-next-line react/no-danger
              <div dangerouslySetInnerHTML={{ __html: doc.content_html }} />
            ) : (
              <p className="text-[13px] text-zinc-500">
                Ce document n&apos;a pas encore de contenu consultable.
              </p>
            )}
          </article>

          <div className="no-print max-w-[760px] mx-auto mt-5 bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-6">
            <SignaturePanel documentId={doc.id} suggestions={suggestions} existing={existing} />
          </div>
        </>
      )}
    </div>
  );
}
