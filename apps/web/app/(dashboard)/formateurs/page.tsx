// ARCHETYPE: command
// Justification: carnet formateurs en données réelles — KPIs + grille de cards, lien vers la fiche.

import Link from 'next/link';
import { Plus, UserCog, Building, Briefcase, Mail, ArrowUpRight, ShieldCheck, FileSignature } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';
import { EmptyState } from '@/shared/ui/empty-state';
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

const palette = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
];

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
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Formateurs</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {trainers.length} formateur{trainers.length > 1 ? 's' : ''} dans votre réseau.
          </p>
        </div>
        <ManageOnly section="dossiers">
        <Link
          href="/formateurs/nouveau"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau formateur
        </Link>
        </ManageOnly>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Impossible de charger les formateurs : {error.message}
          {error.code ? " (code " + error.code + ")" : ""}. Vos données ne sont pas perdues — réessayez dans un instant.
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total formateurs" value={trainers.length} icon={UserCog} accent="violet" />
        <StatCard label="Internes" value={internal} icon={Building} accent="emerald" hint={`${Math.round((internal / Math.max(trainers.length, 1)) * 100)}% de l'équipe`} hintTone="neutral" />
        <StatCard label="Externes" value={external} icon={Briefcase} accent="blue" hint="freelances" hintTone="neutral" />
        <StatCard label="Contrats déposés" value={withContract} icon={FileSignature} accent="amber" hint={`sur ${external} externe${external > 1 ? 's' : ''}`} hintTone="neutral" />
      </section>

      {trainers.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={UserCog}
            title="Aucun formateur dans votre réseau."
            description="Ajoutez votre premier formateur, interne ou externe."
            action={
              <Link
                href="/formateurs/nouveau"
                className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] px-3 py-1.5 rounded-md transition inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Nouveau formateur
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trainers.map((t) => {
            const initials = `${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase();
            const idx = ((t.first_name.charCodeAt(0) || 0) + (t.last_name.charCodeAt(0) || 0)) % palette.length;
            const specialties = t.specialties ?? [];
            const photoUrl = trainerPhotoUrl(t.photo_path);
            return (
              <li key={t.id}>
                <Link
                  href={`/formateurs/${t.id}`}
                  className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0 shadow-sm" />
                      ) : (
                        <span className={`w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-medium flex-shrink-0 shadow-sm ${palette[idx]}`}>
                          {initials}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {t.first_name} {t.last_name}
                          </p>
                          {t.contract_path && (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label="Contrat déposé" />
                          )}
                        </div>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {t.email}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3 min-h-[24px]">
                    {specialties.map((s) => (
                      <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <span className={
                      t.is_internal
                        ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                    }>
                      {t.is_internal ? 'Interne' : 'Externe'}
                    </span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                      {t.contract_path ? 'contrat ✓' : 'sans contrat'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
