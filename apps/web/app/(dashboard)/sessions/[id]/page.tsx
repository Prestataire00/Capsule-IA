import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users, ClipboardCheck, FileText, ClipboardList } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir' };

export default async function SessionOverview({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { learners, sheets } = loaded;
  const base = `/sessions/${params.id}`;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile href={`${base}/apprenants`} icon={Users} label="Apprenants" value={learners.length} />
        <Tile href={`${base}/emargements`} icon={ClipboardCheck} label="Feuilles d'émargement" value={sheets.length} />
        <Tile href={`${base}/documents`} icon={FileText} label="Documents" value="Envoyer" />
        <Tile href={`${base}/questionnaires`} icon={ClipboardList} label="Questionnaires" value="Assigner" />
      </div>

      <section>
        <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-3">Apprenants de la session</h2>
        {learners.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun apprenant rattaché à cette session.</p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {learners.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <Link href={`/dossiers/${l.dossierId}`} className="text-zinc-800 dark:text-zinc-200 hover:text-violet-600">
                  {l.first_name} {l.last_name}
                </Link>
                <span className="text-[12px] text-zinc-400">{l.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-3">Émargements</h2>
        {sheets.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune feuille d'émargement générée.</p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {sheets.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span className="text-zinc-800 dark:text-zinc-200">{HALF_DAY[s.half_day] ?? s.half_day}</span>
                <span className="text-[12px] text-zinc-500">
                  {s.signed}/{s.total} signés · {s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3 hover:border-violet-300 dark:hover:border-violet-800 transition"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
    </Link>
  );
}
