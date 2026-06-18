// ARCHETYPE: command
// Justification: gestion des modèles de documents (liste + accès édition).

import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { TEMPLATE_KIND_LABELS, type TemplateKind } from './schema';
import { SeedButton } from './_components/seed-button';

export const dynamic = 'force-dynamic';

export default async function ModelesPage() {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('document_templates')
    .select('id, kind, title, code, is_active, updated_at')
    .is('deleted_at', null)
    .order('title', { ascending: true });
  const rows =
    (data as unknown as Array<{
      id: string;
      kind: string;
      title: string;
      code: string;
      is_active: boolean;
    }>) ?? [];

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Modèles de documents
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Modèles HTML éditables avec variables. Utilisés pour générer les documents d&apos;un dossier.
          </p>
        </div>
        <Link
          href="/documents/modeles/nouveau"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau modèle
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 space-y-4 border border-dashed border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto" />
          <p className="text-[13px] text-zinc-500">Aucun modèle pour l&apos;instant.</p>
          <div className="flex justify-center">
            <SeedButton />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Modèles ({rows.length})</SectionLabel>
            <SeedButton />
          </div>
          <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {rows.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/documents/modeles/${t.id}`}
                  className="py-3 px-1 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{t.title}</span>
                  </span>
                  <span className="text-[11px] text-zinc-400 flex-shrink-0">
                    {TEMPLATE_KIND_LABELS[t.kind as TemplateKind] ?? t.kind}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
