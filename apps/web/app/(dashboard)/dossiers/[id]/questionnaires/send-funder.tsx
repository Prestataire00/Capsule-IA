'use client';

import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Check, Copy, Loader2, Send } from 'lucide-react';
import { sendFunderQuestionnaire } from './actions';

const TEMPLATES = [
  { code: 'funder_besoins', label: 'Besoins' },
  { code: 'funder_satisfaction', label: 'Satisfaction' },
  { code: 'funder_conformite', label: 'Conformité' },
] as const;

type TemplateCode = (typeof TEMPLATES)[number]['code'];

const ERROR_LABEL: Record<string, string> = {
  dossier_not_found: 'Dossier introuvable.',
  funder_not_linked: 'Ce financeur n’est pas rattaché au dossier.',
  template_not_found: 'Modèle de questionnaire introuvable.',
  assignment_create_failed: 'La création du questionnaire a échoué.',
};

export function SendFunder({
  dossierId,
  funders,
}: {
  dossierId: string;
  funders: { id: string; name: string }[];
}) {
  const { executeAsync } = useAction(sendFunderQuestionnaire);
  const [isPending, startTransition] = useTransition();
  const [templateCode, setTemplateCode] = useState<TemplateCode>(TEMPLATES[0].code);
  const [funderId, setFunderId] = useState<string>(funders[0]?.id ?? '');
  const [link, setLink] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (funders.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Aucun financeur rattaché à ce dossier.
      </p>
    );
  }

  const selectedFunderId = funderId || funders[0]?.id || '';

  const onSend = () => {
    setLink(null);
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await executeAsync({ dossierId, funderId: selectedFunderId, templateCode });
      if (res?.data?.ok) {
        setLink(res.data.link);
        // L'envoi est désormais automatique : le dire évite de renvoyer le lien
        // à la main par-dessus, ou de croire que rien n'est parti.
        setEnvoye(Boolean(res.data.envoye));
      } else {
        const code = res?.data?.error;
        setError(
          (code ? ERROR_LABEL[code] : null) ??
            (res?.serverError ? String(res.serverError) : null) ??
            'L’envoi a échoué.',
        );
      }
    });
  };

  const onCopy = async () => {
    if (!link) return;
    const url = `${window.location.origin}${link}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const selectClass =
    'h-9 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-[13px] text-zinc-800 dark:text-zinc-200 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={templateCode}
          onChange={(e) => setTemplateCode(e.target.value as TemplateCode)}
          className={selectClass}
          aria-label="Type de questionnaire"
        >
          {TEMPLATES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>

        {funders.length > 1 && (
          <select
            value={selectedFunderId}
            onChange={(e) => setFunderId(e.target.value)}
            className={selectClass}
            aria-label="Financeur"
          >
            {funders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={onSend}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:opacity-50 transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Envoyer au financeur
        </button>
      </div>

      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2">
          <span className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />{' '}
            {envoye ? 'Envoyé au financeur' : 'Questionnaire créé — à transmettre'}
          </span>
          <a
            href={link}
            className="font-mono text-[11px] text-emerald-800 dark:text-emerald-200 underline underline-offset-2 break-all"
          >
            {link}
          </a>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-emerald-200/60 dark:border-emerald-900/40 bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 transition"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
