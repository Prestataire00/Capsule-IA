'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileSignature, Loader2, Mail, Printer, User } from 'lucide-react';
import { generateGroupConventions, sendSessionConvocationsRecap } from '../session-actions';

export type ClientRow = {
  key: string;
  label: string;
  companyId: string | null;
  learners: string[];
};

export type SheetRow = { id: string; label: string };

/**
 * Documents par client de la séance (comme RFC) : une convention par
 * entreprise, un contrat par particulier, le récap des convocations au
 * responsable de chaque entreprise et une feuille d'émargement par entreprise.
 */
export function ClientDocuments({
  sessionId,
  clients,
  sheets,
}: {
  sessionId: string;
  clients: ClientRow[];
  sheets: SheetRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const companies = clients.filter((c) => c.companyId);

  const conventions = () => {
    setMessage(null);
    start(async () => {
      const res = await generateGroupConventions({ sessionId });
      const out = res?.data;
      if (!out?.ok) {
        setMessage({ tone: 'err', text: 'La génération a échoué.' });
        return;
      }
      const parts = [
        out.entreprises.length ? `${out.entreprises.length} convention(s) entreprise` : null,
        out.particuliers.length ? `${out.particuliers.length} contrat(s) particulier` : null,
      ].filter(Boolean);
      setMessage({
        tone: 'ok',
        text: parts.length
          ? `${parts.join(' et ')} générés — à retrouver dans les documents des dossiers.`
          : 'Aucun client sur la séance.',
      });
      router.refresh();
    });
  };

  const recap = () => {
    setMessage(null);
    start(async () => {
      const res = await sendSessionConvocationsRecap({ sessionId });
      const out = res?.data;
      if (!out?.ok) {
        setMessage({ tone: 'err', text: 'L’envoi a échoué.' });
        return;
      }
      setMessage({
        tone: out.erreurs.length ? 'err' : 'ok',
        text:
          `${out.envoyes}/${out.entreprises} entreprise(s) prévenue(s).` +
          (out.erreurs.length ? ` ${out.erreurs.join(' · ')}` : ''),
      });
    });
  };

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/70 dark:border-zinc-700 px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Documents par client</p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Entreprise : une convention signée par son responsable, qui reçoit aussi le récap des convocations et sa
          feuille d’émargement. Particulier : un contrat de formation professionnelle à son nom.
        </p>
      </div>

      <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800 text-[13px]">
        {clients.map((c) => (
          <li key={c.key} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 min-w-0 text-zinc-900 dark:text-zinc-100">
              {c.companyId ? <Building2 className="w-3.5 h-3.5 text-zinc-400" /> : <User className="w-3.5 h-3.5 text-zinc-400" />}
              {c.label}
            </span>
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
              {c.companyId ? `${c.learners.length} salarié(s) : ${c.learners.join(', ')}` : 'particulier — contrat individuel'}
            </span>
            {c.companyId && sheets.length > 0 && (
              <span className="ml-auto flex flex-wrap gap-1.5">
                {sheets.map((s) => (
                  <a
                    key={s.id}
                    href={`/api/attendance/${s.id}/paper?companyId=${c.companyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-orange-600"
                    title="Feuille d'émargement de l'entreprise"
                  >
                    <Printer className="w-3 h-3" /> {s.label}
                  </a>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={conventions} disabled={pending || clients.length === 0} className={btn}>
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5" />}
          Générer conventions et contrats
        </button>
        <button type="button" onClick={recap} disabled={pending || companies.length === 0} className={btn}>
          <Mail className="w-3.5 h-3.5" />
          Envoyer le récap des convocations aux entreprises
        </button>
      </div>
      {message && (
        <p className={`text-[12px] ${message.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  );
}
