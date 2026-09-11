// ARCHETYPE: command
// Justification: carnet formateurs en données réelles — chiffres clés + une ligne par formateur, lien vers la fiche.

import Link from 'next/link';
import { Plus, UserCog, Building, Briefcase, Eye, ShieldCheck, FileSignature } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { ManageOnly } from '@/shared/components/auth/manage-only';

type TrainerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_internal: boolean;
  specialties: string[] | null;
  contract_path: string | null;
  photo_path: string | null;
};

function trainerPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trainer-photos/${path}`;
}

const ROW_GRID = 'grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.6fr)_96px_130px_72px] gap-4 px-5';

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
] as const;

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATARS.length;
  return AVATARS[h] ?? AVATARS[0];
}

export default async function FormateursPage() {
  const sb = supabaseServer();
  const { data, error } = await sb
    .schema('app')
    .from('trainers')
    .select('id, first_name, last_name, email, is_internal, specialties, contract_path, photo_path')
    .is('deleted_at', null)
    .order('last_name', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trainers = ((data as any[]) ?? []) as TrainerRow[];
  if (error) console.error('[formateurs] échec chargement:', error.message, error.code);

  const internal = trainers.filter((t) => t.is_internal).length;
  const external = trainers.length - internal;
  const withContract = trainers.filter((t) => t.contract_path).length;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Relations</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Formateurs</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            <span className="tabular-nums">
              {trainers.length} formateur{trainers.length > 1 ? 's' : ''}
            </span>{' '}
            dans votre réseau.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/formateurs/facturation"
            className="border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-4 h-10 inline-flex items-center rounded-lg transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            Factures & frais
          </Link>
          <ManageOnly section="dossiers">
            <Link
              href="/formateurs/nouveau"
              className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nouveau formateur
            </Link>
          </ManageOnly>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Impossible de charger les formateurs : {error.message}
          {error.code ? " (code " + error.code + ")" : ""}. Vos données ne sont pas perdues — réessayez dans un instant.
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total formateurs" value={trainers.length} icon={UserCog} accent="teal" />
        <KpiCard label="Internes" value={internal} icon={Building} accent="blue" hint={`${Math.round((internal / Math.max(trainers.length, 1)) * 100)}% de l'équipe`}>
          <AccentBar value={internal} max={trainers.length} accent="blue" />
        </KpiCard>
        <KpiCard label="Externes" value={external} icon={Briefcase} accent="purple" hint="freelances" />
        <KpiCard label="Contrats déposés" value={withContract} icon={FileSignature} accent="emerald" hint={`sur ${external} externe${external > 1 ? 's' : ''}`}>
          <AccentBar value={withContract} max={external} accent="emerald" />
        </KpiCard>
      </section>

      {trainers.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={UserCog}
            title="Aucun formateur dans votre réseau."
            description="Ajoutez votre premier formateur, interne ou externe."
            action={
              <Link
                href="/formateurs/nouveau"
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Nouveau formateur
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[880px]">
            <div
              className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}
            >
              <div>Formateur</div>
              <div>Spécialités</div>
              <div>Type</div>
              <div>Contrat</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {trainers.map((t) => {
                const initials = `${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase();
                const specialties = t.specialties ?? [];
                const photoUrl = trainerPhotoUrl(t.photo_path);
                const name = `${t.first_name} ${t.last_name}`;
                return (
                  <li key={t.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex items-center gap-3">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className={`w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold flex-shrink-0 ${avatarTone(name)}`}>
                          {initials}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Link
                            href={`/formateurs/${t.id}`}
                            className="truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                          >
                            {name}
                          </Link>
                          {t.contract_path && (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label="Contrat déposé" />
                          )}
                        </div>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{t.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {specialties.length ? (
                        specialties.map((s) => (
                          <span
                            key={s}
                            className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.teal.soft}`}
                          >
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold ${t.is_internal ? ACCENTS.blue.soft : ACCENTS.purple.soft}`}>
                        {t.is_internal ? <Building className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
                        {t.is_internal ? 'Interne' : 'Externe'}
                      </span>
                    </div>
                    <div>
                      {t.contract_path ? (
                        <StatusPill tone="success">contrat déposé</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">sans contrat</StatusPill>
                      )}
                    </div>
                    <div className="flex items-center justify-end">
                      <Link
                        href={`/formateurs/${t.id}`}
                        aria-label={`Ouvrir la fiche — ${name}`}
                        title="Ouvrir la fiche"
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
