// ARCHETYPE: command
// Justification: génération (modèles + IA + PDF) + liste réelle des documents du dossier.

import Link from 'next/link';
import { FileText, Download, Eye } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { GenerateFromTemplate, type TemplateChoice } from './_components/generate-from-template';
import { GenerateWithAi } from './_components/generate-with-ai';
import { EmailDocButton } from './_components/email-doc-button';
import { GenerateConventionsButton } from './_components/generate-conventions-button';

// PDF générés à la volée (générateurs pdf-lib existants : génèrent, persistent, renvoient le PDF).
// La convention est générée à part (1 par financeur + reste à charge) via GenerateConventionsButton.
const GENERATORS = [
  { kind: 'programme', label: 'Programme (PDF)', route: 'programme.pdf' },
  { kind: 'attestation_fin', label: 'Attestation de fin (PDF)', route: 'attestation.pdf' },
  { kind: 'certificat_realisation', label: 'Certificat de réalisation (PDF)', route: 'certificat.pdf' },
] as const;

const KIND_TO_ROUTE: Record<string, string> = {
  convention: 'convention.pdf',
  attestation_fin: 'attestation.pdf',
  certificat_realisation: 'certificat.pdf',
};

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  // Dossier : formation (héritage modèles) + email apprenant (envoi par défaut).
  const { data: dRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('formation_id, learner:learners(email)')
    .eq('id', params.id)
    .maybeSingle();
  const dossier = dRow as unknown as {
    formation_id: string | null;
    learner: { email: string } | { email: string }[] | null;
  } | null;
  const learner = dossier ? (Array.isArray(dossier.learner) ? dossier.learner[0] : dossier.learner) : null;
  const learnerEmail = learner?.email ?? '';
  const formationId = dossier?.formation_id ?? null;

  const [docsRes, tplRes] = await Promise.all([
    sb
      .schema('app')
      .from('documents')
      .select('id, title, kind, status, content_html, storage_path, metadata, created_at')
      .eq('dossier_id', params.id)
      .order('created_at', { ascending: false }),
    sb
      .schema('app')
      .from('document_templates')
      .select('id, title, formation_id')
      .is('deleted_at', null)
      .order('title', { ascending: true }),
  ]);

  const rows =
    (docsRes.data as unknown as Array<{
      id: string;
      title: string;
      kind: string;
      status: string;
      content_html: string | null;
      storage_path: string | null;
      metadata: { payer?: string | null } | null;
      created_at: string;
    }>) ?? [];

  // Héritage : modèles de la formation du dossier d'abord (étoile), puis globaux.
  const tplRows =
    (tplRes.data as unknown as Array<{ id: string; title: string; formation_id: string | null }>) ?? [];
  const templates: TemplateChoice[] = tplRows
    .filter((t) => t.formation_id === null || t.formation_id === formationId)
    .sort((a, b) => {
      const am = a.formation_id === formationId ? 0 : 1;
      const bm = b.formation_id === formationId ? 0 : 1;
      return am - bm;
    })
    .map((t) => ({
      id: t.id,
      title: t.formation_id && t.formation_id === formationId ? `★ ${t.title}` : t.title,
    }));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Générer depuis un modèle</SectionLabel>
          <Link href="/documents/modeles" className="text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400">
            Gérer les modèles
          </Link>
        </div>
        <GenerateFromTemplate dossierId={params.id} templates={templates} />
        <p className="text-[11px] text-zinc-400">
          Le modèle est rempli avec les données du dossier, puis consultable/imprimable. ★ = modèle de cette formation.
        </p>
        <GenerateWithAi dossierId={params.id} />
      </section>

      <section className="space-y-3">
        <SectionLabel>Générer un PDF standard</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <GenerateConventionsButton dossierId={params.id} />
          {GENERATORS.map((g) => (
            <a
              key={g.kind}
              href={`/api/dossiers/${params.id}/${g.route}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 hover:border-violet-300 dark:hover:border-violet-800 transition"
            >
              <FileText className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <span className="text-[13px] text-zinc-900 dark:text-zinc-100 flex-1 truncate">{g.label}</span>
              <Download className="w-3.5 h-3.5 text-zinc-400 group-hover:text-violet-500 transition" />
            </a>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400">
          Ouvrez un PDF une fois pour l&apos;enregistrer : il devient alors envoyable par email ci-dessous.
        </p>
      </section>

      <section className="space-y-3">
        <SectionLabel>Documents générés ({rows.length})</SectionLabel>
        {rows.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            Aucun document généré pour ce dossier. Utilisez les options ci-dessus.
          </p>
        ) : (
          <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {rows.map((d) => {
              const pdfRoute = KIND_TO_ROUTE[d.kind];
              const payer = d.metadata?.payer;
              const downloadHref = pdfRoute
                ? `/api/dossiers/${params.id}/${pdfRoute}${
                    d.kind === 'convention' && payer ? `?payer=${encodeURIComponent(payer)}` : ''
                  }`
                : null;
              return (
                <li key={d.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-3">
                  <span className="truncate">{d.title}</span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-zinc-400">{d.kind}</span>
                    <StatusPill tone={d.status === 'ready' ? 'success' : 'neutral'}>{d.status}</StatusPill>
                    {d.storage_path && <EmailDocButton documentId={d.id} defaultEmail={learnerEmail} />}
                    {d.content_html ? (
                      <Link
                        href={`/documents/${d.id}/apercu`}
                        className="text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Ouvrir
                      </Link>
                    ) : (
                      downloadHref && (
                        <a
                          href={downloadHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          Ouvrir
                        </a>
                      )
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
