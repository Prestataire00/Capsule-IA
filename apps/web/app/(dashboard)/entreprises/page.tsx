// ARCHETYPE: command
// Justification: carnet entreprises réel (RLS-scopé) — cartes avec contact + compteur apprenants.

import Link from 'next/link';
import { Plus, Building2, MapPin, Mail } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';

const palette = [
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
];

export default async function EntreprisesPage() {
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

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Entreprises</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            {companies.length} entreprise{companies.length > 1 ? 's' : ''} dans votre carnet.
          </p>
        </div>
        <Link
          href="/entreprises/nouvelle"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle entreprise
        </Link>
      </header>

      {companies.length === 0 ? (
        <div className="text-[13px] text-zinc-500 inline-flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Aucune entreprise pour l'instant.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => {
            const initials = (c.name as string).split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
            const idx = (c.name as string).charCodeAt(0) % palette.length;
            const city = c.address?.city ?? '';
            return (
              <li key={c.id}>
                <div className="block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0 mb-3">
                    <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-[14px] font-semibold flex-shrink-0 shadow-sm ${palette[idx]}`}>
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.name}</p>
                      {city && (
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{city}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[12px] text-zinc-600 dark:text-zinc-400">
                    {c.contact_email && (
                      <div className="flex items-center gap-2"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{c.contact_email}</span></div>
                    )}
                    {c.contact_name && <div className="text-[11px] text-zinc-500">Contact : {c.contact_name}</div>}
                    {c.siret && <div className="font-mono text-[11px] text-zinc-400">SIRET {c.siret}</div>}
                  </div>
                  <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800 text-[12px] text-zinc-600 dark:text-zinc-400">
                    {learnerCount.get(c.id) ?? 0} apprenant{(learnerCount.get(c.id) ?? 0) > 1 ? 's' : ''} rattaché{(learnerCount.get(c.id) ?? 0) > 1 ? 's' : ''}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
