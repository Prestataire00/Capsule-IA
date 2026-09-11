// ARCHETYPE: command
// Justification: carnet entreprises réel (RLS-scopé) — une ligne par entreprise avec contact + compteur apprenants.

import Link from 'next/link';
import { Plus, Building2, MapPin, Eye, Users, UserCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { KpiCard, ACCENTS } from '@/shared/ui/kpi-card';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { ManageOnly } from '@/shared/components/auth/manage-only';

const ROW_GRID = 'grid grid-cols-[minmax(0,1.7fr)_minmax(0,1.7fr)_170px_110px_72px] gap-4 px-5';

export default async function EntreprisesPage() {
  await requireAccess('crm');
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('companies')
    .select('id, name, siret, contact_email, contact_name, address')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(300);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companies = (data as any[]) ?? [];

  // Compte d'apprenants par entreprise (une requête, agrégée en JS).
  const { data: learnerRows } = await sb.schema('app').from('learners').select('company_id').is('deleted_at', null);
  const learnerCount = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (learnerRows as any[]) ?? []) {
    if (l.company_id) learnerCount.set(l.company_id, (learnerCount.get(l.company_id) ?? 0) + 1);
  }

  const withLearners = companies.filter((c) => (learnerCount.get(c.id) ?? 0) > 0).length;
  const totalAttached = Array.from(learnerCount.values()).reduce((s, n) => s + n, 0);

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Relations</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Entreprises</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            <span className="tabular-nums">
              {companies.length} entreprise{companies.length > 1 ? 's' : ''}
            </span>{' '}
            dans votre carnet.
          </p>
        </div>
        <ManageOnly section="crm">
          <Link
            href="/entreprises/nouvelle"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle entreprise
          </Link>
        </ManageOnly>
      </header>

      {companies.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KpiCard label="Entreprises" value={companies.length} icon={Building2} accent="blue" hint="dans le carnet" />
          <KpiCard label="Avec apprenants" value={withLearners} icon={UserCheck} accent="emerald" hint="au moins un apprenant rattaché" />
          <KpiCard label="Apprenants rattachés" value={totalAttached} icon={Users} accent="rose" hint="toutes entreprises confondues" />
        </section>
      )}

      {companies.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={Building2}
            title="Aucune entreprise dans votre carnet."
            description="Ajoutez une entreprise cliente pour la rattacher à des dossiers et financeurs."
            action={
              <Link
                href="/entreprises/nouvelle"
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-8 rounded-lg transition inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Nouvelle entreprise
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
              <div>Entreprise</div>
              <div>Contact</div>
              <div>SIRET</div>
              <div>Apprenants</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {companies.map((c) => {
                const city = c.address?.city ?? '';
                const count = learnerCount.get(c.id) ?? 0;
                return (
                  <li key={c.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
                        <Building2 className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/entreprises/${c.id}`}
                          className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                        >
                          {c.name}
                        </Link>
                        {city && (
                          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {city}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      {c.contact_name || c.contact_email ? (
                        <>
                          {c.contact_name && (
                            <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">Contact : {c.contact_name}</p>
                          )}
                          {c.contact_email && <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">{c.contact_email}</p>}
                        </>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      {c.siret ? (
                        <span className="font-mono text-[12px] text-zinc-600 dark:text-zinc-400">{c.siret}</span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div
                      className="tabular-nums"
                      title={`${count} apprenant${count > 1 ? 's' : ''} rattaché${count > 1 ? 's' : ''}`}
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${
                          count > 0 ? ACCENTS.rose.soft : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {count}
                      </span>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400"> rattaché{count > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center justify-end">
                      <Link
                        href={`/entreprises/${c.id}`}
                        aria-label={`Ouvrir la fiche — ${c.name}`}
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
