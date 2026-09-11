'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Loader2 } from 'lucide-react';
import { setAutoPaymentReminders } from './actions';

/** Relances automatiques : paiement (lendemain de l'échéance, puis tous les 15 j, 3 max) et signature des devis (J-3). */
export function AutoRemindersToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !enabled;
    if (
      next &&
      !window.confirm(
        'Activer les relances automatiques ? Les payeurs recevront un e-mail le lendemain de l’échéance, puis tous les 15 jours (3 relances au plus), et les clients un rappel 3 jours avant l’expiration d’un devis non signé.',
      )
    ) {
      return;
    }
    start(async () => {
      const res = await setAutoPaymentReminders(next);
      if (res.ok) router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`text-[13px] px-3 py-1.5 rounded-md border inline-flex items-center gap-2 transition ${
        enabled
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
      }`}
      title="Relances de paiement et de signature automatiques"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />}
      Relances auto : {enabled ? 'activées' : 'désactivées'}
    </button>
  );
}
