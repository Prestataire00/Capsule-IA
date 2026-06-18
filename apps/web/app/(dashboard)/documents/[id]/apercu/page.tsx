// ARCHETYPE: command
// Justification: aperçu imprimable d'un document généré depuis un modèle.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { PrintButton } from './_components/print-button';

export const dynamic = 'force-dynamic';

export default async function DocumentPreviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('documents')
    .select('id, title, content_html, dossier_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  const doc = data as unknown as {
    id: string;
    title: string;
    content_html: string | null;
    dossier_id: string | null;
  } | null;
  if (!doc) notFound();

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
        .doc-sheet p { margin: 8px 0; line-height: 1.55; }
        .doc-sheet ul { margin: 6px 0 6px 18px; list-style: disc; }
        .doc-sheet li { margin: 2px 0; }
        .doc-sheet .doc-header { font-size: 12px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 18px; }
        .doc-sheet .signatures { margin-top: 36px; }
      `}</style>

      <div className="no-print max-w-[760px] mx-auto mb-4 flex items-center justify-between">
        <Link
          href={doc.dossier_id ? `/dossiers/${doc.dossier_id}/documents` : '/dossiers'}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour au dossier
        </Link>
        <PrintButton />
      </div>

      <article className="doc-sheet bg-white text-zinc-900 max-w-[760px] mx-auto rounded-sm shadow-lg px-12 py-12">
        {doc.content_html ? (
          // eslint-disable-next-line react/no-danger
          <div dangerouslySetInnerHTML={{ __html: doc.content_html }} />
        ) : (
          <p className="text-[13px] text-zinc-500">
            Ce document est un fichier (PDF) — utilisez le bouton de téléchargement dans l&apos;onglet Documents.
          </p>
        )}
      </article>
    </div>
  );
}
