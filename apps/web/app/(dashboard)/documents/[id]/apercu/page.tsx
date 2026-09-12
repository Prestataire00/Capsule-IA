// ARCHETYPE: command
// Justification: aperçu imprimable + demande de signature d'un document.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';
import { PrintButton } from './_components/print-button';
import { EditableDocument } from './_components/editable-document';
import { DOCUMENT_CSS } from '@/features/documents/document-styles';
import {
  SignaturePanel,
  type ExistingSignature,
  type SignerSuggestion,
} from './_components/signature-panel';

export const dynamic = 'force-dynamic';

export default async function DocumentPreviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  // Client non typé pour les colonnes de versionnage (0158), absentes des
  // types générés tant que `pnpm db:types` n'a pas été rejoué.
  const sbDocs = sb as unknown as SupabaseClient;
  const { data } = await sbDocs
    .schema('app')
    .from('documents')
    .select(
      'id, title, content_html, dossier_id, storage_path, mime_type, organization_id, version, parent_document_id, source_key, source_url, created_at',
    )
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
    organization_id: string | null;
    version: number | null;
    parent_document_id: string | null;
    source_key: string | null;
    source_url: string | null;
    created_at: string | null;
  } | null;
  if (!doc) notFound();

  // Historique : les versions précédentes du même document (même source).
  const { data: versionRows } = doc.source_key
    ? await sbDocs
        .schema('app')
        .from('documents')
        .select('id, version, created_at, is_current')
        .eq('source_key', doc.source_key)
        .is('deleted_at', null)
        .order('version', { ascending: false })
    : { data: [] };
  const versions = ((versionRows ?? []) as Array<{
    id: string;
    version: number | null;
    created_at: string | null;
    is_current: boolean | null;
  }>).filter((v) => v.id !== doc.id);

  // Fichier PDF (pas de HTML inline) → aperçu embarqué dans le navigateur.
  const isPdf = !doc.content_html && !!doc.storage_path;

  // Branding : logo de l'organisme (à défaut, logo Capsule IA) + nom, injectés
  // en tête du document, avec un filet orange (couleur de marque) sur les marges.
  let logoSrc = '/logo-capsule-full.png';
  let orgName = '';
  if (doc.organization_id) {
    const [{ data: orgRow }, orgLogo] = await Promise.all([
      sb.schema('app').from('organizations').select('name').eq('id', doc.organization_id).maybeSingle(),
      loadOrgLogoDataUri(sb as never, doc.organization_id),
    ]);
    orgName = (orgRow as { name?: string } | null)?.name ?? '';
    if (orgLogo) logoSrc = orgLogo;
  }

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
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 py-8 px-4">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          .doc-sheet, .doc-brand, .doc-brand-footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        ${DOCUMENT_CSS}
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
            href={`/api/documents/${doc.id}?dl=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition inline-flex items-center gap-2 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
          >
            <Download className="w-4 h-4" />
            Ouvrir / Télécharger
          </a>
        ) : (
          <PrintButton />
        )}
      </div>

      {(doc.source_url || versions.length > 0) && (
        <div
          className={`no-print mx-auto mb-4 rounded-lg border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-[12px] text-zinc-600 dark:text-zinc-400 ${
            isPdf ? 'max-w-[900px]' : 'max-w-[760px]'
          }`}
        >
          <p className="text-zinc-900 dark:text-zinc-100 font-semibold">
            Version {doc.version ?? 1}
            {doc.source_url && ' · document tenu à jour'}
          </p>
          {doc.source_url && (
            <p className="mt-0.5">
              Ce document est régénéré à l’ouverture, à partir des données du jour. La copie archivée reste
              consultable :{' '}
              <a href={`/api/documents/${doc.id}?fige=1`} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
                voir la version archivée
              </a>
              .
            </p>
          )}
          {versions.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/documents/${v.id}/apercu`} className="hover:underline">
                    Version {v.version ?? 1}
                    {v.created_at ? ` — ${new Date(v.created_at).toLocaleDateString('fr-FR')}` : ''}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isPdf ? (
        <div className="max-w-[900px] mx-auto">
          <div className="rounded-sm shadow-lg overflow-hidden bg-white">
            <object data={`/api/documents/${doc.id}`} type={doc.mime_type ?? 'application/pdf'} className="w-full bg-white" style={{ height: '85vh' }}>
              {/* Repli si le navigateur n'affiche pas le PDF dans la page (Safari, lecteurs désactivés). */}
              <div className="p-10 text-center">
                <p className="text-[14px] text-zinc-700">Votre navigateur n&apos;affiche pas le document ici.</p>
                <a
                  href={`/api/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition"
                >
                  Ouvrir le document
                </a>
              </div>
            </object>
          </div>
          <p className="no-print text-center text-[12px] text-zinc-500 dark:text-zinc-400 mt-3">
            L&apos;aperçu ne s&apos;affiche pas ?{' '}
            <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
              Ouvrir le document dans un nouvel onglet
            </a>
          </p>
        </div>
      ) : (
        <>
          {doc.content_html ? (
            <EditableDocument
              documentId={doc.id}
              initialHtml={doc.content_html}
              logoSrc={logoSrc}
              orgName={orgName}
            />
          ) : (
            <article className="doc-sheet bg-white text-zinc-900 max-w-[760px] mx-auto rounded-sm shadow-lg px-12 py-12">
              <div className="doc-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoSrc} alt={orgName || 'Logo'} />
                {orgName && <span className="doc-org-name">{orgName}</span>}
              </div>
              <p className="text-[13px] text-zinc-500">
                Ce document n&apos;a pas encore de contenu consultable.
              </p>
            </article>
          )}

          <div className="no-print max-w-[760px] mx-auto mt-5 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-6">
            <SignaturePanel documentId={doc.id} suggestions={suggestions} existing={existing} />
          </div>
        </>
      )}
    </div>
  );
}
