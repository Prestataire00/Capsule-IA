// ARCHETYPE: command
// Justification: catalogue formations en données réelles — KPIs, recherche + filtre modalité fonctionnels, grille.

import Link from 'next/link';
import { Plus, Search, GraduationCap, BookOpen, Eye, EyeOff, Video, MapPin, Users as UsersIcon } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { CopyInscriptionLink } from '@/shared/ui/copy-inscription-link';
import { EmptyState } from '@/shared/ui/empty-state';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { FilterDropdown } from '@/shared/components/filters/filter-dropdown.client';
import { formationColorMap, deepColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';
import { KpiCard, ACCENTS, type Accent } from '@/shared/ui/kpi-card';

const modalityStyles = {
  presentiel: { icon: MapPin, label: 'Présentiel', accent: 'blue' as Accent },
  distanciel: { icon: Video, label: 'Distanciel', accent: 'sky' as Accent },
  hybride: { icon: GraduationCap, label: 'Hybride', accent: 'teal' as Accent },
};
type ModalityKey = keyof typeof modalityStyles;

const MODALITIES = ['presentiel', 'distanciel', 'hybride'] as const;

const ROW_GRID = 'grid grid-cols-[minmax(0,2.6fr)_minmax(0,1.1fr)_128px_80px_112px_112px_96px] gap-4 px-5';

const hoursFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

type FormationRow = {
  id: string;
  code: string;
  title: string;
  default_modality: string;
  default_duration_hours: number;
  is_published: boolean;
  created_at: string | null;
};

type SearchParams = { q?: string; modality?: string };

export default async function FormationsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const modality = MODALITIES.includes(searchParams.modality as (typeof MODALITIES)[number]) ? searchParams.modality! : '';

  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, code, title, default_modality, default_duration_hours, is_published, created_at')
    .is('deleted_at', null)
    .order('code', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = ((data as any[]) ?? []) as FormationRow[];
  const colors = formationColorMap(all);

  // Compteurs d'apprenants actifs par formation (dossiers actifs/planifiés).
  const { data: dossierRows } = await sb
    .schema('app')
    .from('dossiers')
    .select('formation_id, status')
    .is('deleted_at', null);
  const activeByFormation = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of ((dossierRows as any[]) ?? [])) {
    if (d.status === 'active' || d.status === 'scheduled') {
      activeByFormation.set(d.formation_id, (activeByFormation.get(d.formation_id) ?? 0) + 1);
    }
  }

  const published = all.filter((f) => f.is_published).length;
  const draft = all.length - published;
  const totalActive = Array.from(activeByFormation.values()).reduce((s, n) => s + n, 0);

  const filtered = all.filter((f) => {
    if (modality && f.default_modality !== modality) return false;
    if (q && !(`${f.title} ${f.code}`.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Catalogue</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Formations</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            Catalogue de <span className="tabular-nums">{all.length}</span> formation{all.length > 1 ? 's' : ''} dans votre OF.
          </p>
        </div>
        <ManageOnly section="catalogue">
          <Link
            href="/formations/nouvelle"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle formation
          </Link>
        </ManageOnly>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" aria-label="Synthèse">
        <KpiCard label="Total formations" value={all.length} icon={BookOpen} accent="orange" hint="au catalogue de l'OF" />
        <KpiCard label="Publiées" value={published} icon={Eye} accent="emerald" hint="visibles au catalogue" />
        <KpiCard label="Brouillons" value={draft} icon={EyeOff} accent="amber" hint={draft > 0 ? 'à publier' : '—'} />
        <KpiCard label="Apprenants actifs" value={totalActive} icon={UsersIcon} accent="rose" hint="dossiers en cours" />
      </section>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <form action="/formations" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une formation, un code…"
            className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] w-80 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
          />
          {modality && <input type="hidden" name="modality" value={modality} />}
        </form>
        <FilterDropdown
          label="Modalité"
          paramName="modality"
          options={MODALITIES.map((m) => ({ value: m, label: modalityStyles[m].label }))}
          selected={modality ? [modality] : []}
          basePath="/formations"
          preserved={{ q: searchParams.q || undefined }}
        />
        {(modality || searchParams.q) && (
          <Link
            href="/formations"
            className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 h-9 inline-flex items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            Réinitialiser
          </Link>
        )}
      </div>

      {all.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={GraduationCap}
            title="Aucune formation au catalogue."
            description="Créez votre première formation pour pouvoir monter des dossiers."
            action={
              <Link
                href="/formations/nouvelle"
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Nouvelle formation
              </Link>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={GraduationCap}
            title="Aucune formation ne correspond."
            description="Élargissez la recherche ou réinitialisez le filtre de modalité."
            action={
              <Link
                href="/formations"
                className="border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 h-8 inline-flex items-center rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
              >
                Réinitialiser
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[960px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Formation</div>
              <div>Code</div>
              <div>Modalité</div>
              <div>Durée</div>
              <div>Apprenants</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filtered.map((f) => {
                const m = modalityStyles[f.default_modality as ModalityKey] ?? modalityStyles.presentiel;
                const Icon = m.icon;
                const enrolled = activeByFormation.get(f.id) ?? 0;
                const color = colors.get(f.id) ?? NEUTRAL_COLOR;
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
                      <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS[m.accent].soft}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {m.label}
                      </span>
                    </div>

                    <div className={`text-[13px] font-bold tabular-nums ${ACCENTS.sky.text}`}>
                      {hoursFmt.format(Number(f.default_duration_hours))} h
                    </div>

                    <div className="text-[13px] tabular-nums">
                      {enrolled > 0 ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${ACCENTS.rose.soft}`}>
                          <UsersIcon className="w-3 h-3" />
                          {enrolled}
                          <span className="font-medium"> actif{enrolled > 1 ? 's' : ''}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>

                    <div>
                      <StatusPill tone={f.is_published ? 'success' : 'warning'}>{f.is_published ? 'Publiée' : 'Brouillon'}</StatusPill>
                    </div>

                    <div className="flex items-center justify-end gap-0.5">
                      <CopyInscriptionLink formationId={f.id} />
                      <Link
                        href={`/formations/${f.id}`}
                        aria-label={`Ouvrir la formation — ${f.title}`}
                        title="Ouvrir la formation"
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
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
