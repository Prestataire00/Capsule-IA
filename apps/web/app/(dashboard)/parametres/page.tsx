// ARCHETYPE: shared
// Justification: index des paramètres — une carte colorée par section de réglages.
import Link from 'next/link';
import { Building2, Users, ShieldCheck, Plug, Link2, Scale, ArrowUpRight } from 'lucide-react';
import { ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { cn } from '@/shared/lib/cn';

const SECTIONS: { href: string; label: string; hint: string; icon: typeof Building2; accent: Accent }[] = [
  {
    href: '/parametres/organisation',
    label: 'Organisation',
    hint: 'Identité légale, Qualiopi, émargement, logo, signature et cachet.',
    icon: Building2,
    accent: 'orange',
  },
  {
    href: '/parametres/membres',
    label: 'Membres',
    hint: 'Équipe, rôles et accès à l’organisation.',
    icon: Users,
    accent: 'rose',
  },
  {
    href: '/parametres/inscription',
    label: "Lien d'inscription",
    hint: 'Lien public vers votre catalogue, à intégrer sur votre site.',
    icon: Link2,
    accent: 'amber',
  },
  {
    href: '/parametres/securite',
    label: 'Sécurité',
    hint: 'Mot de passe, authentification à 2 facteurs, conservation et RGPD.',
    icon: ShieldCheck,
    accent: 'purple',
  },
  {
    href: '/parametres/integrations',
    label: 'Intégrations',
    hint: 'Google Agenda / Meet, Zoom, e-mails et paiement.',
    icon: Plug,
    accent: 'blue',
  },
  {
    href: '/parametres/documents-legaux',
    label: 'Documents légaux',
    hint: 'Règlement intérieur, CGV et livret d’accueil assistés par IA.',
    icon: Scale,
    accent: 'emerald',
  },
];

export default function ParametresIndex() {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {SECTIONS.map((s) => {
        const a = ACCENTS[s.accent];
        const Icon = s.icon;
        return (
          <li key={s.href}>
            <Link
              href={s.href}
              className={cn(
                'group flex h-full items-start gap-4 rounded-xl border bg-gradient-to-br p-5 shadow-sm hover:shadow-md transition',
                a.card,
              )}
            >
              <span className={cn('w-11 h-11 rounded-xl grid place-items-center text-white shadow-md shrink-0', a.chip)}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className={cn('block text-[15px] font-extrabold', a.value)}>{s.label}</span>
                <span className="block text-[12px] text-zinc-600 dark:text-zinc-400 mt-1">{s.hint}</span>
              </span>
              <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
