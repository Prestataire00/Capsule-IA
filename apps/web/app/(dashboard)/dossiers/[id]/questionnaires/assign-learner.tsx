'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Check, Copy, Loader2, Send } from 'lucide-react';
import { envoyerQuestionnaireApprenant } from './actions';

const ERROR_LABEL: Record<string, string> = {
  pas_du_dossier: 'Cette personne n’est pas stagiaire du dossier.',
  modele_introuvable: 'Ce questionnaire ne s’adresse pas aux apprenants.',
  deja_repondu: 'Cette personne a déjà répondu à ce questionnaire.',
  adresse_publique_absente: 'Adresse publique de l’application absente : lien impossible.',
  creation_impossible: 'L’envoi a échoué. Réessayez.',
  dossier_not_found: 'Dossier introuvable.',
};

/**
 * Un questionnaire à un apprenant précis — celui qui n'a pas eu le sien, par
 * exemple. Le lien part par e-mail et s'affiche ici, à copier au besoin.
 */
export function AssignLearner({
  dossierId,
  templates,
  apprenants,
}: {
  dossierId: string;
  templates: { id: string; title: string }[];
  apprenants: { id: string; nom: string; email: string | null }[];
}) {
  const router = useRouter();
  const { executeAsync } = useAction(envoyerQuestionnaireApprenant);
  const [isPending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [learnerId, setLearnerId] = useState(apprenants[0]?.id ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; lien?: string } | null>(null);
  const [copie, setCopie] = useState(false);

  if (templates.length === 0) {
    return <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun modèle disponible — créez-en un dans Questionnaires.</p>;
  }
  if (apprenants.length === 0) {
    return <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun stagiaire dans ce dossier.</p>;
  }

  const selectClass =
    'h-9 min-w-0 max-w-full rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-[13px] text-zinc-800 dark:text-zinc-200 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10';

  const onSend = () => {
    setMsg(null);
    setCopie(false);
    startTransition(async () => {
      const res = await executeAsync({ dossierId, templateId, learnerId });
      const r = res?.data;
      const nom = apprenants.find((a) => a.id === learnerId)?.nom ?? 'l’apprenant';
      if (r?.ok) {
        setMsg({
          ok: true,
          text: r.envoye ? `Envoyé à ${nom} (${r.email}).` : r.email ? `Lien prêt pour ${nom} — l’e-mail n’est pas parti : transmettez le lien.` : `${nom} n’a pas d’adresse : transmettez-lui ce lien.`,
          lien: r.lien,
        });
        router.refresh();
      } else {
        const code = r && !r.ok ? r.error : undefined;
        setMsg({ ok: false, text: (code ? ERROR_LABEL[code] : null) ?? 'L’envoi a échoué.' });
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)} className={selectClass} aria-label="Apprenant">
          {apprenants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nom}
              {a.email ? '' : ' (sans e-mail)'}
            </option>
          ))}
        </select>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={selectClass} aria-label="Questionnaire">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSend}
          disabled={isPending || !learnerId || !templateId}
          className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:opacity-50 transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Envoyer
        </button>
      </div>
      {msg && (
        <div className="space-y-1.5">
          <p className={`text-[12px] inline-flex items-center gap-1 ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {msg.ok && <Check className="w-3 h-3" />}
            {msg.text}
          </p>
          {msg.lien && (
            <div className="flex items-center gap-2">
              <input readOnly value={msg.lien} aria-label="Lien du questionnaire" className={`${selectClass} flex-1 text-[12px] text-zinc-500`} onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(msg.lien ?? '');
                  setCopie(true);
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                {copie ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copie ? 'Copié' : 'Copier'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
