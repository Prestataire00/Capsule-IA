'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Loader2, Check, RefreshCw, Unplug } from 'lucide-react';
import { testGoogleCalendarFromStored, disconnectGoogleCalendar } from './actions';

export type GoogleStatus = {
  configured: boolean;
  accountEmail: string | null;
  lastTestStatus: 'success' | 'error' | null;
  lastTestError: string | null;
};

export function GoogleCalendarForm({ initialStatus, error }: { initialStatus: GoogleStatus; error: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-[12px] text-red-600 dark:text-red-400">
          Échec de la connexion Google ({error}). Réessayez.
        </p>
      )}

      {initialStatus.configured ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Connecté{initialStatus.accountEmail ? ` — ${initialStatus.accountEmail}` : ''}
            </span>
          </div>
          {initialStatus.lastTestStatus === 'error' && (
            <p className="text-[12px] text-amber-600 dark:text-amber-400">
              Dernier test en échec ({initialStatus.lastTestError}). Reconnectez si besoin.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await testGoogleCalendarFromStored();
                  setMsg(r.ok ? { ok: true, text: 'Connexion OK' } : { ok: false, text: r.error });
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Tester
            </button>
            <a
              href="/api/integrations/google-calendar/connect"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Reconnecter
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await disconnectGoogleCalendar();
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-red-600 disabled:opacity-50"
            >
              <Unplug className="w-3.5 h-3.5" /> Déconnecter
            </button>
          </div>
          {msg && <p className={`text-[12px] ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
        </div>
      ) : (
        <a
          href="/api/integrations/google-calendar/connect"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
        >
          <CalendarDays className="w-4 h-4" /> Connecter Google Agenda
        </a>
      )}
    </div>
  );
}
