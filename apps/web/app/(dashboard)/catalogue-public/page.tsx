// ARCHETYPE: command
// Justification : gestion du catalogue PUBLIC de l'OF — lien partageable (visible
// par tous), et liste des formations publiées avec accès direct à l'éditeur de
// programme / à l'aperçu public. Le statut « publié » se règle sur la fiche
// formation ; cette page centralise la diffusion.

import Link from 'next/link';
import { Globe, Pencil, ExternalLink, GraduationCap, MapPin, Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { CopyPublicLink } from '@/features/catalog/copy-public-link.client';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';
import { formationColorMap, deepColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';

export const dynamic = 'force-dynamic';

type Row = { id: string; code: string; title: string; is_published: boolean; default_modality: string | null; created_at: string | null };

const modalityLabel = (m: string | null) =>
  m === 'distanciel' ? 'Distanciel' : m === 'hybride' ? 'Hybride' : 'Présentiel';

const ROW_GRID = 'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_128px_minmax(0,1.4fr)] gap-4 px-5';
const ICON_BTN =
  'w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition';

export default async function CataloguePublicPage() {
  const me = await getCurrentMember();
  const orgId = me?.organizationId ?? '';

  const sb = supabaseServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb as any)
    .schema('app')
    .from('formations')
    .select('id, code, title, is_published, default_modality, created_at')
    .is('deleted_at', null)
    .order('code', { ascending: true });
  const all = ((data as Row[]) ?? []) as Row[];
  const colors = formationColorMap(all);
  const published = all.filter((f) => f.is_published);
  const drafts = all.length - published.length;

  const catalogueLink = `/catalogue?org=${encodeURIComponent(orgId)}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Catalogue public</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
          Votre catalogue en ligne
        </h1>
        <p className="mt-3 text-[14px] text-zinc-500 dark:text-zinc-400">
          Partagez ce lien : il affiche toutes vos formations publiées, chacune avec son programme détaillé.
        </p>
      </header>

      <div className="mb-8 rounded-xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
          <Globe className="h-4 w-4 text-zinc-400" />
          Lien public du catalogue
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-zinc-50 px-3 h-9 inline-flex items-center font-mono text-[13px] text-zinc-700 ring-1 ring-inset ring-zinc-200/80 dark:bg-zinc-950/40 dark:text-zinc-300 dark:ring-zinc-800">
            /catalogue?org={orgId || '—'}
          </code>
          <CopyPublicLink path={catalogueLink} label="Copier le lien du catalogue" />
          <a
            href={catalogueLink}
            target="_blank"
            rel="noreferrer"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" /> Ouvrir le catalogue
          </a>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
          Formations publiées <span className="tabular-nums text-zinc-500 dark:text-zinc-400">({published.length})</span>
        </h2>
        {drafts > 0 && (
          <Link href="/formations" className="text-[12px] font-semibold text-orange-600 hover:underline dark:text-orange-400 tabular-nums">
            {drafts} brouillon{drafts > 1 ? 's' : ''} non publié{drafts > 1 ? 's' : ''} →
          </Link>
        )}
      </div>

      {published.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={GraduationCap}
            title="Aucune formation publiée"
            description="Publiez une formation (statut « Publié » sur sa fiche) pour la faire apparaître dans le catalogue public."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[720px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Formation</div>
              <div>Code</div>
              <div>Modalité</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {published.map((f) => {
                const programmeLink = `/catalogue/${f.id}?org=${encodeURIComponent(orgId)}`;
                const color = colors.get(f.id) ?? NEUTRAL_COLOR;
                const ModalityIcon = f.default_modality === 'presentiel' || !f.default_modality ? MapPin : Video;
                return (
                  <li key={f.id} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex gap-3">
                      <span className="mt-[5px] w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: color }} />
                      <Link
                        href={`/formations/${f.id}`}
                        className="min-w-0 block truncate text-[14px] font-extrabold hover:underline"
                        style={{ color: deepColor(color) }}
                      >
                        {f.title}
                      </Link>
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-[12px] text-zinc-500 dark:text-zinc-400">{f.code}</span>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <ModalityIcon className="w-3.5 h-3.5" />
                        {modalityLabel(f.default_modality)}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/formations/${f.id}/programme`}
                        className={ICON_BTN}
                        title="Éditer le programme"
                        aria-label={`Éditer le programme — ${f.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <a
                        href={programmeLink}
                        target="_blank"
                        rel="noreferrer"
                        className={ICON_BTN}
                        title="Voir"
                        aria-label={`Voir la fiche publique — ${f.title}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <CopyPublicLink path={programmeLink} label="Copier" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
