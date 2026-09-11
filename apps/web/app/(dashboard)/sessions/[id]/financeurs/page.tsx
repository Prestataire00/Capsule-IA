import { notFound } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

const euros = (c: number) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

type FunderLink = { funder_id: string; amount_cents: number; status: string };

export default async function SessionFundersTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { dossierIds } = loaded;

  let links: FunderLink[] = [];
  if (dossierIds.length) {
    const { data } = await sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, status')
      .in('dossier_id', dossierIds);
    links = (data as unknown as FunderLink[] | null) ?? [];
  }

  const funderIds = [...new Set(links.map((l) => l.funder_id))];
  const { data: funderData } = funderIds.length
    ? await sb.schema('app').from('funders').select('id, name, kind').in('id', funderIds)
    : { data: [] as unknown[] };
  const funders = new Map(
    ((funderData as { id: string; name: string; kind: string }[]) ?? []).map((f) => [f.id, f]),
  );

  // Agrégat par financeur.
  const byFunder = new Map<string, { name: string; kind: string; total: number; count: number }>();
  for (const l of links) {
    const f = funders.get(l.funder_id);
    const key = l.funder_id;
    const cur = byFunder.get(key) ?? { name: f?.name ?? '—', kind: f?.kind ?? '', total: 0, count: 0 };
    cur.total += l.amount_cents ?? 0;
    cur.count += 1;
    byFunder.set(key, cur);
  }
  const rows = [...byFunder.values()].sort((a, b) => b.total - a.total);
  const total = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Financeurs agrégés (en lecture) depuis les dossiers des apprenants de la session. Le financement reste nominatif par apprenant.
      </p>
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState icon={Wallet} title="Aucun financeur" description="Aucun financement rattaché aux apprenants de cette session." />
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 inline-block min-w-[200px]">
            <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 mb-3">Total financé</p>
            <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{euros(total)}</p>
          </div>
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="min-w-0">
                  <span className="block font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.name}</span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{r.count} apprenant{r.count > 1 ? 's' : ''}</span>
                </span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{euros(r.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
