// ARCHETYPE: command
// Justification: vue d'ensemble réelle du dossier — compteurs + accès rapides aux onglets.

import Link from 'next/link';
import { ClipboardList, Calendar, FileText, Users as UsersIcon } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';

export default async function DossierOverviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const id = params.id;
  const count = async (table: string, col = 'dossier_id') => {
    const { count } = await sb.schema('app').from(table).select('*', { count: 'exact', head: true }).eq(col, id);
    return count ?? 0;
  };
  const [modules, sessions, documents, funders] = await Promise.all([
    count('dossier_modules'),
    count('session_dossiers'),
    count('documents'),
    count('dossier_funders'),
  ]);

  const cards = [
    { icon: ClipboardList, label: 'Modules', value: modules, href: 'modules' },
    { icon: Calendar, label: 'Sessions', value: sessions, href: 'sessions' },
    { icon: FileText, label: 'Documents', value: documents, href: 'documents' },
    { icon: UsersIcon, label: 'Financeurs', value: funders, href: 'financeurs' },
  ];

  return (
    <div className="space-y-6">
      <SectionLabel>Vue d'ensemble</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ icon: Icon, label, value, href }) => (
          <Link
            key={href}
            href={`/dossiers/${id}/${href}`}
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-3.5 h-3.5 text-zinc-400" />
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
            </div>
            <p className="text-[22px] font-medium">{value}</p>
          </Link>
        ))}
      </div>
      <p className="text-[12px] text-zinc-500">
        Utilisez les onglets ci-dessus pour gérer modules, sessions, émargements, heures, Qualiopi, financeurs et documents.
      </p>
    </div>
  );
}
