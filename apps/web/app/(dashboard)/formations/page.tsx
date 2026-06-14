// ARCHETYPE: command
// Justification: catalogue formations en données réelles — KPIs, recherche + filtre modalité fonctionnels, grille.

import Link from 'next/link';
import { Plus, Search, GraduationCap, BookOpen, Eye, EyeOff, Clock, Video, MapPin, Users as UsersIcon, ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';
import { CopyInscriptionLink } from '@/shared/ui/copy-inscription-link';
import { EmptyState } from '@/shared/ui/empty-state';

const modalityStyles = {
  presentiel: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400', icon: MapPin, label: 'Présentiel' },
  distanciel: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', icon: Video, label: 'Distanciel' },
  hybride: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', icon: GraduationCap, label: 'Hybride' },
  afest: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: BookOpen, label: 'AFEST' },
};
type ModalityKey = keyof typeof modalityStyles;

const MODALITIES = ['presentiel', 'distanciel', 'hybride', 'afest'] as const;

type FormationRow = {
  id: string;
  code: string;
  title: string;
  default_modality: string;
  default_duration_hours: number;
  is_published: boolean;
};

type SearchParams = { q?: string; modality?: string };

export default async function FormationsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const modality = MODALITIES.includes(searchParams.modality as (typeof MODALITIES)[number]) ? searchParams.modality! : '';

  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, code, title, default_modality, default_duration_hours, is_published')
    .is('deleted_at', null)
    .order('code', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = ((data as any[]) ?? []) as FormationRow[];

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

  const modalityHref = (m: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (m) p.set('modality', m);
    const s = p.toString();
    return s ? `/formations?${s}` : '/formations';
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Formations</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            Catalogue de {all.length} formation{all.length > 1 ? 's' : ''} dans votre OF.
          </p>
        </div>
        <Link
          href="/formations/nouvelle"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle formation
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total formations" value={all.length} icon={BookOpen} accent="violet" />
        <StatCard label="Publiées" value={published} icon={Eye} accent="emerald" hint="visibles au catalogue" hintTone="success" />
        <StatCard label="Brouillons" value={draft} icon={EyeOff} accent="amber" hint={draft > 0 ? 'à publier' : '—'} hintTone={draft > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Apprenants actifs" value={totalActive} icon={UsersIcon} accent="blue" hint="dossiers en cours" hintTone="neutral" />
      </section>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <form action="/formations" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une formation, un code…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
          {modality && <input type="hidden" name="modality" value={modality} />}
        </form>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400 mr-2">Modalité :</span>
          <Link
            href={modalityHref('')}
            className={!modality ? 'bg-violet-600 text-white px-2.5 py-1 rounded-md font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition'}
          >
            Toutes
          </Link>
          {MODALITIES.map((m) => (
            <Link
              key={m}
              href={modalityHref(m)}
              className={modality === m ? 'bg-violet-600 text-white px-2.5 py-1 rounded-md font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition'}
            >
              {modalityStyles[m].label}
            </Link>
          ))}
        </div>
      </div>

      {all.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={GraduationCap}
            title="Aucune formation au catalogue."
            description="Créez votre première formation pour pouvoir monter des dossiers."
            action={
              <Link href="/formations/nouvelle" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] px-3 py-1.5 rounded-md transition inline-flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" /> Nouvelle formation
              </Link>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={GraduationCap}
            title="Aucune formation ne correspond."
            description="Élargissez la recherche ou réinitialisez le filtre de modalité."
            action={
              <Link href="/formations" className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition">
                Réinitialiser
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => {
            const m = modalityStyles[f.default_modality as ModalityKey] ?? modalityStyles.presentiel;
            const Icon = m.icon;
            const enrolled = activeByFormation.get(f.id) ?? 0;
            return (
              <li key={f.id} className="relative">
                <Link
                  href={`/formations/${f.id}`}
                  className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${m.bg}`}>
                      <Icon className={`w-5 h-5 ${m.text}`} />
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                  </div>

                  <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mb-1">{f.code}</p>
                  <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-3 line-clamp-2">{f.title}</p>

                  <div className="flex items-center gap-3 text-[12px] text-zinc-600 dark:text-zinc-400 mb-3">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {Number(f.default_duration_hours)} h
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="w-3 h-3" />
                      {m.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <span className={
                      f.is_published
                        ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1'
                        : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 inline-flex items-center gap-1'
                    }>
                      {f.is_published ? (<><Eye className="w-2.5 h-2.5" /> publiée</>) : (<><EyeOff className="w-2.5 h-2.5" /> brouillon</>)}
                    </span>
                    {enrolled > 0 && (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono inline-flex items-center gap-1">
                        <UsersIcon className="w-3 h-3" />
                        {enrolled} apprenant{enrolled > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </Link>
                <CopyInscriptionLink formationId={f.id} className="absolute top-3 right-12 z-10" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
