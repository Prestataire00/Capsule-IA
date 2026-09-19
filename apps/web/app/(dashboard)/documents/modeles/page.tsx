// ARCHETYPE: command
// Justification: gestion des modèles de documents (liste groupée par catégorie).

import Link from 'next/link';
import { FileText, Plus, Pencil } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { kindStyle } from '../kind-style';
import { TEMPLATE_KIND_LABELS, type TemplateKind } from './schema';
import { SeedButton } from './_components/seed-button';
import { CategoryManager, type Category } from './_components/category-manager';

export const dynamic = 'force-dynamic';

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_72px] gap-4 px-5';

type Row = { id: string; kind: string; title: string; category_id: string | null };

export default async function ModelesPage() {
  const sb = supabaseServer();
  const [tplRes, catRes] = await Promise.all([
    sb
      .schema('app')
      .from('document_templates')
      .select('id, kind, title, category_id')
      .is('deleted_at', null)
      .order('title', { ascending: true }),
    sb
      .schema('app')
      .from('document_categories' as never)
      .select('id, name')
      .order('position', { ascending: true }),
  ]);

  const rows = (tplRes.data as unknown as Row[]) ?? [];
  const categories = ((catRes.data as unknown as Category[]) ?? []);

  // Groupes : chaque catégorie (dans l'ordre) puis « Non classé ».
  const groups: { id: string | null; name: string; items: Row[] }[] = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: rows.filter((r) => r.category_id === c.id) })),
    { id: null, name: 'Non classé', items: rows.filter((r) => !r.category_id || !categories.some((c) => c.id === r.category_id)) },
  ].filter((g) => g.items.length > 0 || g.id !== null);

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9 space-y-7">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Documents</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Modèles de documents</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
            Modèles HTML éditables avec variables. Utilisés pour générer les documents d&apos;un dossier.{' '}
            <span className="tabular-nums">
              {rows.length} modèle{rows.length > 1 ? 's' : ''} · {categories.length} catégorie{categories.length > 1 ? 's' : ''}
            </span>
          </p>
        </div>
        <Link
          href="/documents/modeles/nouveau"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouveau modèle
        </Link>
      </header>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionLabel>Modèles ({rows.length})</SectionLabel>
        <div className="flex items-center gap-4">
          <CategoryManager categories={categories} />
          <SeedButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={FileText}
            title="Aucun modèle pour l'instant."
            description="Importez les modèles par défaut ou créez-en un."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.id ?? 'none'}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-md grid place-items-center ${g.id ? ACCENTS.orange.soft : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                  {g.name}
                </h2>
                <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.orange.soft}`}>
                  {g.items.length} modèle{g.items.length > 1 ? 's' : ''}
                </span>
              </div>
              {g.items.length === 0 ? (
                <p className="text-[12px] text-zinc-400 px-1">Aucun modèle.</p>
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
                  <div className="min-w-[560px]">
                    <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
                      <div>Modèle</div>
                      <div>Type</div>
                      <div className="text-right">Actions</div>
                    </div>
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {g.items.map((t) => {
                        const ks = kindStyle(t.kind);
                        const KindIcon = ks.icon;
                        return (
                        <li key={t.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                          <div className="min-w-0 flex items-center gap-3">
                            <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${ACCENTS[ks.accent].soft}`}>
                              <KindIcon className="w-4 h-4" />
                            </span>
                            <Link
                              href={`/documents/modeles/${t.id}`}
                              className="min-w-0 truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                            >
                              {t.title}
                            </Link>
                          </div>
                          <span className={`truncate font-semibold ${ACCENTS[ks.accent].text}`}>
                            {TEMPLATE_KIND_LABELS[t.kind as TemplateKind] ?? t.kind}
                          </span>
                          <div className="flex items-center justify-end">
                            <Link
                              href={`/documents/modeles/${t.id}`}
                              aria-label={`Modifier — ${t.title}`}
                              title="Modifier"
                              className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
