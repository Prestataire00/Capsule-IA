'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, Target, BarChart3, Users } from 'lucide-react';

// Une fiche besoin EST un questionnaire de positionnement : les deux vivaient
// dans deux groupes de menu différents, et l'on ne savait pas où chercher.
const TABS = [
  { href: '/questionnaires', label: 'Envois', icon: ClipboardList, iconCls: 'text-blue-500 dark:text-blue-400' },
  // Rangés par interlocuteur et par étape : c'est ainsi qu'on les cherche —
  // « qu'est-ce que mon stagiaire reçoit ? », « qu'est-ce qui part après ? ».
  { href: '/questionnaires/catalogue', label: 'Par interlocuteur', icon: Users, iconCls: 'text-rose-500 dark:text-rose-400' },
  { href: '/questionnaires/fiches-besoin', label: 'Fiches besoin', icon: Target, iconCls: 'text-purple-500 dark:text-purple-400' },
  { href: '/questionnaires/analytics', label: 'Analyse', icon: BarChart3, iconCls: 'text-emerald-500 dark:text-emerald-400' },
];

export function QuestionnairesTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/70 dark:border-zinc-800 mb-6">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? 'inline-flex items-center gap-2 text-[13px] font-bold text-orange-700 dark:text-orange-300 border-b-2 border-orange-500 px-3 py-2.5 -mb-px'
                : 'inline-flex items-center gap-2 text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2.5 transition'
            }
          >
            <Icon className={`w-3.5 h-3.5 ${t.iconCls}`} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
