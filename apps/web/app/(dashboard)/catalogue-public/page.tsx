// ARCHETYPE: command
// Justification : gestion du catalogue PUBLIC de l'OF — lien partageable (visible
// par tous), et liste des formations publiées avec accès direct à l'éditeur de
// programme / à l'aperçu public. Le statut « publié » se règle sur la fiche
// formation ; cette page centralise la diffusion.

import Link from 'next/link';
import { Globe, Pencil, ExternalLink, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { CopyPublicLink } from '@/features/catalog/copy-public-link.client';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

type Row = { id: string; code: string; title: string; is_published: boolean; default_modality: string | null };

const modalityLabel = (m: string | null) =>
  m === 'distanciel' ? 'Distanciel' : m === 'hybride' ? 'Hybride' : 'Présentiel';

export default async function CataloguePublicPage() {
  const me = await getCurrentMember();
  const orgId = me?.organizationId ?? '';

  const sb = supabaseServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb as any)
    .schema('app')
    .from('formations')
    .select('id, code, title, is_published, default_modality')
    .is('deleted_at', null)
    .order('code', { ascending: true });
  const all = ((data as Row[]) ?? []) as Row[];
  const published = all.filter((f) => f.is_published);
  const drafts = all.length - published.length;

  const catalogueLink = `/catalogue?org=${encodeURIComponent(orgId)}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400">
          <Globe className="h-5 w-5" />
          <span className="text-[13px] font-semibold uppercase tracking-wide">Catalogue public</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Votre catalogue en ligne
        </h1>
        <p className="mt-1 text-[14px] text-zinc-500 dark:text-zinc-400">
          Partagez ce lien : il affiche toutes vos formations publiées, chacune avec son programme détaillé.
        </p>
      </header>

      <div className="mb-8 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900/40 dark:bg-violet-950/20">
        <div className="text-[12px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-400">
          Lien public du catalogue
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-white px-3 py-2 text-[13px] text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
            /catalogue?org={orgId || '—'}
          </code>
          <CopyPublicLink path={catalogueLink} label="Copier le lien du catalogue" />
          <a
            href={catalogueLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-violet-800"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Ouvrir le catalogue
          </a>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          Formations publiées ({published.length})
        </h2>
        {drafts > 0 && (
          <Link href="/formations" className="text-[12px] font-medium text-violet-700 hover:underline dark:text-violet-400">
            {drafts} brouillon{drafts > 1 ? 's' : ''} non publié{drafts > 1 ? 's' : ''} →
          </Link>
        )}
      </div>

      {published.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Aucune formation publiée"
          description="Publiez une formation (statut « Publié » sur sa fiche) pour la faire apparaître dans le catalogue public."
        />
      ) : (
        <ul className="space-y-2">
          {published.map((f) => {
            const programmeLink = `/catalogue/${f.id}?org=${encodeURIComponent(orgId)}`;
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                  {f.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
                  {f.title}
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
                  <Eye className="h-3.5 w-3.5" /> {modalityLabel(f.default_modality)}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/formations/${f.id}/programme`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:border-violet-300 hover:text-violet-700 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Éditer le programme
                  </Link>
                  <a
                    href={programmeLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:border-violet-300 hover:text-violet-700 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Voir
                  </a>
                  <CopyPublicLink path={programmeLink} label="Copier" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
