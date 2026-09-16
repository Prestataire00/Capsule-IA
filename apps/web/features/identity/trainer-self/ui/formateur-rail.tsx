'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Home,
  ClipboardList,
  FolderOpen,
  CircleUser,
  List,
  CalendarDays,
  CheckSquare,
  Receipt,
  Wallet,
  Star,
  UserRound,
  FileBadge,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/logo';

/**
 * Barre latérale de l'espace formateur, sur la charpente de l'espace organisme :
 * colonne d'icônes à gauche, panneau des sous-rubriques au survol.
 *
 * La barre horizontale précédente mettait tout sur une ligne — les séances
 * comme les notes de frais — et ne pouvait pas montrer les sous-rubriques sans
 * les empiler. Ici la hiérarchie se voit : quatre sections, leurs pages
 * dessous.
 */

export type RailCounts = {
  /** Messages non lus, tous fils confondus. */
  messages?: number;
  /** Séances du jour : ce qui doit être fait maintenant. */
  duJour?: number;
  /** Compétences expirées ou sur le point de l'être. */
  competences?: number;
};

export type SeanceRecente = { id: string; titre: string; quand: string };

type Item = { href: string; label: string; icon: typeof Home };

type Groupe = {
  cle: string;
  label: string;
  court?: string;
  icon: typeof Home;
  /** Rubrique sans sous-pages : l'icône est le lien. */
  href?: string;
  items?: Item[];
  /** Compteur affiché sur l'icône. */
  compteur?: keyof RailCounts;
  /** Le panneau liste les prochaines séances sous les sous-rubriques. */
  montreSeances?: boolean;
};

const GROUPES: Groupe[] = [
  { cle: 'aujourdhui', label: 'Aujourd’hui', icon: Home, href: '/formateur', compteur: 'duJour' },
  {
    cle: 'seances',
    label: 'Mes séances',
    court: 'Séances',
    icon: ClipboardList,
    compteur: 'messages',
    montreSeances: true,
    items: [
      { href: '/mes-sessions', label: 'À faire', icon: List },
      { href: '/mes-sessions?vue=calendrier', label: 'Calendrier', icon: CalendarDays },
      { href: '/mes-sessions?vue=disponibilites', label: 'Mes disponibilités', icon: CheckSquare },
    ],
  },
  { cle: 'dossiers', label: 'Mes dossiers', court: 'Dossiers', icon: FolderOpen, href: '/mes-dossiers' },
  {
    cle: 'compte',
    label: 'Mon compte',
    court: 'Compte',
    icon: CircleUser,
    compteur: 'competences',
    items: [
      { href: '/mes-factures', label: 'Mes factures', icon: Receipt },
      { href: '/mes-frais', label: 'Notes de frais', icon: Wallet },
      { href: '/mes-evaluations', label: 'Mes évaluations', icon: Star },
      { href: '/profil', label: 'Mon profil', icon: UserRound },
      { href: '/cv', label: 'CV & compétences', icon: FileBadge },
    ],
  },
];

/** Le chemin d'un sous-item peut porter une vue (`?vue=…`) : on compare à part. */
const separe = (href: string): { chemin: string; vue: string | null } => {
  const [chemin, requete] = href.split('?');
  const vue = requete ? (new URLSearchParams(requete).get('vue') ?? null) : null;
  return { chemin: chemin ?? href, vue };
};

export function FormateurRail({
  counts,
  seances = [],
  nom,
}: {
  counts?: RailCounts;
  seances?: SeanceRecente[];
  nom?: string;
}) {
  const pathname = usePathname();
  // La vue d'une même page vit dans la requête (`?vue=…`), pas dans le chemin.
  const vueCourante = useSearchParams().get('vue');
  const [survole, setSurvole] = useState<string | null>(null);
  const dernierPanneau = useRef<string>('seances');

  const estActif = (href: string) => {
    const { chemin } = separe(href);
    if (chemin === '/formateur') return pathname === chemin;
    return pathname === chemin || pathname.startsWith(`${chemin}/`);
  };

  // « Mes séances » couvre aussi la fiche d'une séance et l'émargement.
  const groupeActif =
    GROUPES.find((g) => {
      if (g.cle === 'seances') {
        return ['/mes-sessions', '/seance', '/emarger', '/mon-planning'].some(
          (p) => pathname === p || pathname.startsWith(`${p}/`),
        );
      }
      if (g.href) return estActif(g.href);
      return g.items?.some((i) => estActif(i.href));
    })?.cle ?? null;

  if (survole && GROUPES.find((g) => g.cle === survole)?.items?.length) dernierPanneau.current = survole;
  const panneau = GROUPES.find((g) => g.cle === dernierPanneau.current);
  const montrePanneau =
    survole !== null && (GROUPES.find((g) => g.cle === survole)?.items?.length ?? 0) > 0;

  const initiales = (nom ?? '')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* Réserve la largeur de la colonne dans le flux du layout. */}
      <div className="w-20 shrink-0" />

      <div className="fixed left-0 top-0 h-screen z-40 flex" onMouseLeave={() => setSurvole(null)}>
        <nav className="w-20 flex flex-col items-center border-r border-orange-200/60 dark:border-zinc-800/80 bg-[linear-gradient(180deg,hsl(24_100%_97%)_0%,hsl(24_95%_92%)_50%,hsl(24_90%_88%)_100%)] dark:bg-[linear-gradient(180deg,rgb(9_9_11)_0%,rgb(9_9_11)_60%,rgb(67_20_7/0.35)_100%)] shadow-[inset_-1px_0_0_rgb(255_255_255/0.6)] dark:shadow-none">
          <Link href="/formateur" className="mt-4 mb-3 shrink-0 flex flex-col items-center gap-1" aria-label="Accueil">
            <Logo size="sm" showWordmark={false} />
            <span className="text-[10px] font-semibold tracking-tight leading-none text-zinc-700 dark:text-zinc-300">
              Formateur
            </span>
          </Link>

          <div className="w-8 h-px bg-orange-200/80 dark:bg-zinc-800 mb-2" />

          <div className="flex-1 flex flex-col gap-1 w-full px-2 overflow-y-auto scrollbar-thin">
            {GROUPES.map((g) => {
              const Icone = g.icon;
              const actif = groupeActif === g.cle;
              const survol = survole === g.cle;
              const total = g.compteur ? (counts?.[g.compteur] ?? 0) : 0;

              const contenu = (
                <div
                  className={cn(
                    'relative flex flex-col items-center gap-0.5 py-2 rounded-xl cursor-pointer transition-all duration-150',
                    actif
                      ? 'bg-orange-500 text-white shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/15'
                      : survol
                        ? 'bg-orange-100/70 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-orange-100/50 dark:hover:bg-orange-950/30 hover:text-orange-700 dark:hover:text-orange-300',
                  )}
                  onMouseEnter={() => setSurvole(g.cle)}
                >
                  <Icone className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight text-center break-words">
                    {g.court ?? g.label}
                  </span>
                  {total > 0 && (
                    <span
                      className={cn(
                        'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium flex items-center justify-center tabular-nums shadow-sm',
                        actif ? 'bg-white text-orange-600' : 'bg-rose-500 text-white',
                      )}
                    >
                      {total > 99 ? '99+' : total}
                    </span>
                  )}
                </div>
              );

              return g.href ? (
                <Link key={g.cle} href={g.href} className="group">
                  {contenu}
                </Link>
              ) : (
                <div key={g.cle} className="group">
                  {contenu}
                </div>
              );
            })}
          </div>

          <Link
            href="/profil"
            className="my-3 group"
            aria-label={nom ? `Compte de ${nom}` : 'Mon compte'}
            title={nom}
            onMouseEnter={() => setSurvole(null)}
          >
            <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[12px] flex items-center justify-center shadow-sm ring-2 ring-white/60 dark:ring-zinc-900 group-hover:ring-orange-300 dark:group-hover:ring-orange-700 transition">
              {initiales || '·'}
            </span>
          </Link>
        </nav>

        <div
          className={cn(
            'bg-white dark:bg-zinc-950 border-r border-zinc-200/60 dark:border-zinc-800 transition-[width,opacity,box-shadow] duration-200 ease-out overflow-hidden',
            montrePanneau ? 'w-60 opacity-100 shadow-xl' : 'w-0 opacity-0 shadow-none',
          )}
        >
          <div className="w-60 flex flex-col h-screen">
            <div className="px-4 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">
                Section
              </p>
              <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                {panneau?.label}
              </h3>
            </div>

            <ul className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
              {panneau?.items?.map((item) => {
                const Icone = item.icon;
                const { chemin, vue } = separe(item.href);
                const memePage = pathname === chemin || pathname.startsWith(`${chemin}/`);
                // Sur une page à vues, l'item actif est celui dont la vue est
                // ouverte — la vue par défaut valant l'absence de paramètre.
                const actif = memePage && (vue ?? null) === (vueCourante ?? null);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSurvole(null)}
                      className={cn(
                        'group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition whitespace-nowrap',
                        actif
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-medium'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100',
                      )}
                    >
                      <span
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition',
                          actif
                            ? 'bg-orange-500 text-white shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/15'
                            : 'bg-orange-100/70 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400 group-hover:scale-105',
                        )}
                      >
                        <Icone className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}

              {panneau?.montreSeances && seances.length > 0 && (
                <li className="pt-4">
                  <p className="px-3 mb-1 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 font-medium">
                    Prochaines
                  </p>
                  <ul className="space-y-0.5">
                    {seances.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/seance/${s.id}`}
                          onClick={() => setSurvole(null)}
                          className="group flex flex-col px-3 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                        >
                          <span className="text-[12px] text-zinc-700 dark:text-zinc-300 truncate">{s.titre}</span>
                          <span className="text-[10px] text-zinc-400 tabular-nums">{s.quand}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
