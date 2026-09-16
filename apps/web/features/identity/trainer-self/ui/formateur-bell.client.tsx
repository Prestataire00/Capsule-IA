'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, Check } from 'lucide-react';
import { NOTIF_META, NOTIF_FALLBACK, type Notif } from '@/app/(dashboard)/notifications/notif-meta';
import { marquerMaNotificationLue, marquerMesNotificationsLues } from '@/app/(formateur)/mes-notifications/actions';

/**
 * Cloche de l'espace formateur.
 *
 * Même rôle que celle de l'organisme, mais adressée à la personne : un
 * formateur externe n'appartient à aucune organisation, et les actions de
 * l'autre cloche — qui résolvent l'organisme du membre — n'auraient rien
 * marqué. C'est là qu'arrive la réponse de la direction sur un cours proposé.
 */

const horodatage = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Les notifications d'un formateur pointent sa séance ou son cours. */
function lien(n: Notif): string | null {
  const p = n.payload ?? {};
  if (n.related_aggregate_type === 'session_resource' && typeof p.session_id === 'string') {
    return `/seance/${p.session_id}/supports`;
  }
  if (typeof p.session_id === 'string') return `/seance/${p.session_id}`;
  return null;
}

export function FormateurBell({ notifications, unreadCount }: { notifications: Notif[]; unreadCount: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [compte, setCompte] = useState(unreadCount);
  const [ecartees, setEcartees] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const visibles = notifications.filter((n) => !ecartees.has(n.id));

  const ecarter = (id: string) => {
    setEcartees((s) => new Set(s).add(id));
    setCompte((c) => Math.max(0, c - 1));
    startTransition(() => marquerMaNotificationLue(id));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label={compte > 0 ? `${compte} notification(s) non lue(s)` : 'Notifications'}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
      >
        <Bell className="w-4 h-4" />
        {compte > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-medium flex items-center justify-center tabular-nums shadow-sm">
            {compte > 99 ? '99+' : compte}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOuvert(false)}
          />
          <div className="absolute right-0 mt-2 w-80 z-50 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">Notifications</p>
              {compte > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setEcartees(new Set(notifications.map((n) => n.id)));
                    setCompte(0);
                    startTransition(() => marquerMesNotificationsLues());
                  }}
                  className="text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Tout marquer lu
                </button>
              )}
            </div>

            {visibles.length === 0 ? (
              <p className="px-4 py-8 text-[13px] text-zinc-400 text-center">Rien de nouveau.</p>
            ) : (
              <ul className="max-h-96 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {visibles.map((n) => {
                  const meta = NOTIF_META[n.template_code] ?? NOTIF_FALLBACK;
                  const Icone = meta.icon;
                  const href = lien(n);
                  const contenu = (
                    <span className="flex items-start gap-2.5 px-4 py-3">
                      <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${meta.tone}`}>
                        <Icone className="w-3.5 h-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {meta.label}
                        </span>
                        {n.subject && (
                          <span className="block text-[12px] text-zinc-600 dark:text-zinc-400 truncate">
                            {n.subject}
                          </span>
                        )}
                        <span className="block text-[11px] text-zinc-400 tabular-nums">
                          {horodatage.format(new Date(n.created_at))}
                        </span>
                      </span>
                    </span>
                  );
                  return (
                    <li key={n.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition">
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => {
                            ecarter(n.id);
                            setOuvert(false);
                          }}
                        >
                          {contenu}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => ecarter(n.id)} className="w-full text-left">
                          {contenu}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <Link
              href="/mes-notifications"
              onClick={() => setOuvert(false)}
              className="block px-4 py-2.5 text-[12px] font-semibold text-center text-orange-600 dark:text-orange-400 border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
            >
              Tout voir
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
