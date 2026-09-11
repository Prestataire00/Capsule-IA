'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CircleCheck,
  ClipboardList,
  Clock,
  FileText,
  Info,
  KeyRound,
  Landmark,
  Receipt,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Onglets de la fiche session, dans l'ordre de RFC (Informations → Évaluations),
 * puis les autres sous-pages. Tous visibles d'un coup d'œil : la barre passe
 * à la ligne plutôt que de défiler.
 */
const tabs = [
  { slug: '', label: 'Informations', icon: Info },
  { slug: 'apprenants', label: 'Participants', icon: Users },
  { slug: 'emargements', label: 'Émargement', icon: CircleCheck },
  { slug: 'fiches-besoin', label: 'Fiches besoin', icon: ClipboardList },
  { slug: 'automatisations', label: 'Automatisations', icon: Zap },
  { slug: 'documents', label: 'Documents', icon: FileText },
  { slug: 'questionnaires', label: 'Évaluations', icon: Star },
  { slug: 'heures', label: 'Heures', icon: Clock },
  { slug: 'qualiopi', label: 'Qualiopi', icon: ShieldCheck },
  { slug: 'facturation', label: 'Facturation', icon: Receipt },
  { slug: 'financeurs', label: 'Financeurs', icon: Landmark },
  { slug: 'depenses', label: 'Dépenses', icon: Wallet },
  { slug: 'activite', label: 'Activité', icon: Activity },
  { slug: 'acces', label: 'Accès', icon: KeyRound },
];

export function SessionTabsNav({ baseHref }: { baseHref: string }) {
  const pathname = usePathname();
  return (
    <nav role="tablist" aria-label="Rubriques de la session" className="border-b border-zinc-200/70 dark:border-zinc-800 flex flex-wrap items-center gap-x-1">
      {tabs.map((t) => {
        const href = t.slug ? `${baseHref}/${t.slug}` : baseHref;
        const active = t.slug ? pathname.startsWith(href) : pathname === baseHref;
        const Icone = t.icon;
        return (
          <Link
            key={t.slug}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              'inline-flex items-center gap-1.5 text-[13px] px-3 py-2.5 -mb-px border-b-2 transition-colors whitespace-nowrap',
              active
                ? 'text-zinc-900 dark:text-zinc-100 border-orange-500 font-medium'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100',
            )}
          >
            <Icone className="w-4 h-4" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
