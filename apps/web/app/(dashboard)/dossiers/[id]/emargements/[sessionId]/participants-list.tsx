'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Link2, Loader2, Mail, User as UserIcon, GraduationCap } from 'lucide-react';
import { generateParticipantSignatureLink } from './actions';

export type ParticipantItem = {
  id: string;
  kind: 'learner' | 'trainer';
  fullName: string;
  email: string | null;
  signed: boolean;
};

type LinkCache = Record<string, { url: string; expiresAt: string }>;

export function ParticipantsList({
  sheetId,
  participants,
}: {
  sheetId: string;
  participants: ParticipantItem[];
}) {
  const [linkCache, setLinkCache] = useState<LinkCache>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleGenerate = (p: ParticipantItem) => {
    setError(null);
    setActiveId(`${p.kind}:${p.id}`);
    startTransition(async () => {
      const result = await generateParticipantSignatureLink({
        sheetId,
        participantId: p.id,
        participantKind: p.kind,
      });
      if (result.ok) {
        setLinkCache((prev) => ({
          ...prev,
          [`${p.kind}:${p.id}`]: { url: result.url, expiresAt: result.expiresAt },
        }));
      } else {
        setError(result.error);
      }
      setActiveId(null);
    });
  };

  const handleCopy = async (key: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (participants.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl p-10 text-center shadow-sm">
        <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 mb-1">Pas de participant</p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Ajoutez des apprenants et formateurs à la session avant d&apos;ouvrir la feuille d&apos;émargement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg p-3 text-[12px] text-red-900 dark:text-red-200">
          Erreur : {error}
        </div>
      )}

      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {participants.map((p) => {
          const key = `${p.kind}:${p.id}`;
          const link = linkCache[key];
          const isLoading = pending && activeId === key;
          const KindIcon = p.kind === 'learner' ? GraduationCap : UserIcon;
          const kindColor = p.kind === 'learner' ? 'rose' : 'blue';

          return (
            <li key={key} className="p-4">
              <div className="flex items-start gap-3 mb-2">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${kindColor === 'rose' ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300' : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'}`}>
                  <KindIcon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{p.fullName}</p>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {p.kind === 'learner' ? 'apprenant' : 'formateur'}
                    </span>
                    {p.signed ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        Signé
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        En attente
                      </span>
                    )}
                  </div>
                  {p.email && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 inline-flex items-center gap-1">
                      <Mail className="w-2.5 h-2.5" />
                      {p.email}
                    </p>
                  )}
                </div>
              </div>

              {p.signed ? null : link ? (
                <div className="ml-12 flex items-stretch gap-2">
                  <input
                    type="text"
                    value={link.url}
                    readOnly
                    className="flex-1 font-mono text-[11px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 transition"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(key, link.url)}
                    className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-medium px-3 py-2 rounded-lg transition inline-flex items-center gap-1.5 flex-shrink-0"
                  >
                    {copiedId === key ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    {copiedId === key ? 'Copié' : 'Copier'}
                  </button>
                </div>
              ) : (
                <div className="ml-12">
                  <button
                    type="button"
                    onClick={() => handleGenerate(p)}
                    disabled={isLoading}
                    className="bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                    {isLoading ? 'Génération…' : 'Générer le lien de signature'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-zinc-400 text-center pt-2">
        Conseil : envoie les liens individuellement par SMS / email à chaque participant. Ils expirent dans 24h.
      </p>
    </div>
  );
}
