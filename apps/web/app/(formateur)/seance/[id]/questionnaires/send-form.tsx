'use client';

import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { KIND_LABELS, isSatisfactionKind } from '@/features/trainer-space/questionnaires';
import { sendSessionQuestionnaire } from './actions';

const ERREURS: Record<string, string> = {
  template_not_allowed: 'Ce questionnaire ne peut pas être envoyé depuis votre espace.',
  forbidden: 'Cette séance ne fait pas partie des vôtres.',
  unauthenticated: 'Session expirée — reconnectez-vous.',
};

export function SendQuestionnaireForm({ sessionId, templates }: { sessionId: string; templates: { id: string; title: string; kind: string }[] }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();
  const choisi = templates.find((t) => t.id === templateId);

  if (templates.length === 0) {
    return <p className="text-[13px] text-zinc-500">Aucun questionnaire disponible : l’organisme n’en a pas encore activé.</p>;
  }

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-900">
      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">Questionnaire à envoyer</span>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} — {KIND_LABELS[t.kind] ?? t.kind}
            </option>
          ))}
        </select>
      </label>
      {choisi && isSatisfactionKind(choisi.kind) && (
        <p className="text-[12px] text-zinc-500">Les réponses de satisfaction restent anonymes : vous verrez des moyennes dans « Évaluations ».</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !templateId}
          onClick={() =>
            start(async () => {
              setMessage(null);
              const r = await sendSessionQuestionnaire({ sessionId, templateId });
              if (!r.ok) return setMessage({ ok: false, texte: ERREURS[r.error] ?? 'L’envoi a échoué. Réessayez.' });
              const morceaux = [`${r.sent} e-mail${r.sent > 1 ? 's' : ''} envoyé${r.sent > 1 ? 's' : ''}`];
              if (r.skipped) morceaux.push(`${r.skipped} déjà destinataire${r.skipped > 1 ? 's' : ''}`);
              if (r.withoutEmail.length) morceaux.push(`sans e-mail : ${r.withoutEmail.join(', ')}`);
              setMessage({ ok: true, texte: morceaux.join(' · ') });
            })
          }
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg shadow-sm disabled:opacity-40"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer aux apprenants de la séance
        </button>
        {message && (
          <span role="status" className={`text-[12px] ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {message.texte}
          </span>
        )}
      </div>
    </div>
  );
}
