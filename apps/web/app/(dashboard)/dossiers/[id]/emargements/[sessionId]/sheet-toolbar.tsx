'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Printer } from 'lucide-react';
import { attendanceErrorLabel } from '@/features/attendance/schemas';
import { sendSheetLinksAction } from './actions';

const bouton =
  'inline-flex items-center gap-1.5 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[12px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition disabled:opacity-40';

/** Envoi des liens par e-mail et planche de QR à imprimer, pour une feuille. */
export function SheetToolbar({ sheetId, sessionId }: { sheetId: string; sessionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={bouton}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const r = await sendSheetLinksAction({ sheetId });
            if (!r.ok) {
              setMessage({ ok: false, texte: attendanceErrorLabel(r.error) });
              return;
            }
            const morceaux = [`${r.sent} lien${r.sent > 1 ? 's' : ''} envoyé${r.sent > 1 ? 's' : ''}`];
            if (r.withoutEmail.length) morceaux.push(`sans e-mail : ${r.withoutEmail.join(', ')}`);
            if (r.failed.length) morceaux.push(`échec : ${r.failed.join(', ')}`);
            setMessage({ ok: r.failed.length === 0, texte: morceaux.join(' · ') });
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
        Envoyer les liens par e-mail
      </button>
      <a href={`/api/attendance/sessions/${sessionId}/qr-cards?sheet=${sheetId}`} target="_blank" rel="noopener" className={bouton}>
        <Printer className="w-3.5 h-3.5" />
        QR à imprimer
      </a>
      {message && (
        <span role="status" className={`text-[12px] ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
          {message.texte}
        </span>
      )}
    </div>
  );
}
