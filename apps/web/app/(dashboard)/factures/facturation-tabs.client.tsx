'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSignature, Receipt, UserCog } from 'lucide-react';

// L'argent était réparti en trois endroits : deux entrées de menu dans
// « Gestion » et une page atteignable seulement en creusant depuis Formateurs.
// Les URL ne bougent pas — c'est le chemin pour y arriver qui se raccourcit.
const TABS = [
  { href: '/devis', label: 'Devis', icon: FileSignature, iconCls: 'text-purple-500 dark:text-purple-400' },
  { href: '/factures', label: 'Factures', icon: Receipt, iconCls: 'text-emerald-500 dark:text-emerald-400' },
  {
    href: '/formateurs/facturation',
    label: 'Formateurs',
    icon: UserCog,
    iconCls: 'text-rose-500 dark:text-rose-400',
  },
];

export function FacturationTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/70 dark:border-zinc-800 mb-6">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
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
