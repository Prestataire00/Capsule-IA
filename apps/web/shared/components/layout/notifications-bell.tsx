'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  NOTIF_META,
  NOTIF_FALLBACK,
  notifHref,
  type Notif,
} from '@/app/(dashboard)/notifications/notif-meta';
import { markNotificationsRead } from '@/app/(dashboard)/notifications/mark-read-action';

export function NotificationsBell({
  notifications,
  unreadCount,
}: {
  notifications: Notif[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unreadCount);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      startTransition(() => markNotificationsRead());
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-orange-500 text-white text-[9px] font-medium flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-50 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800">
              <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Notifications</p>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-5 h-5 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
                <p className="text-[12px] text-zinc-400">Aucune notification</p>
              </div>
            ) : (
              <ul className="max-h-[22rem] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                {notifications.map((n) => {
                  const meta = NOTIF_META[n.template_code] ?? NOTIF_FALLBACK;
                  const Icon = meta.icon;
                  const href = notifHref(n);
                  const inner = (
                    <div className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-zinc-800 dark:text-zinc-200 leading-snug">
                          {n.subject ?? meta.label}
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">
                          {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link href={href} onClick={() => setOpen(false)} className="block hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-[12px] font-medium text-orange-600 dark:text-orange-400 border-t border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
            >
              Voir tout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
