'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileCheck2, FileSignature, Loader2, Mail, Printer, User } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { generateGroupConventions, sendCompanyAttendanceSheets, sendSessionConvocationsRecap } from '../session-actions';

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

  const sendSheets = (companyId: string, label: string) => {
    if (!window.confirm(`Envoyer à ${label} ses feuilles d’émargement signées de la séance ?`)) return;
    setMessage(null);
    start(async () => {
      const res = await sendCompanyAttendanceSheets({ sessionId, companyId });
      const out = res?.data;
      if (!out?.ok) {
        const reason = out && !out.ok ? out.error : 'erreur';
        setMessage({
          tone: 'err',
          text:
            reason === 'no_contact_email'
              ? `${label} : aucun e-mail de responsable (fiche entreprise ou devis).`
              : reason === 'no_sheet'
                ? 'Aucune feuille d’émargement sur cette séance.'
                : 'L’envoi a échoué.',
        });
        return;
      }
      setMessage({ tone: 'ok', text: `${out.sheets} feuille(s) envoyée(s) à ${out.email}.` });
    });
  };

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/40 px-3 h-9 text-[13px] font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-950/70 disabled:opacity-50 transition';
  const sheetLink =
    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold hover:text-orange-600 dark:hover:text-orange-300';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
          <FileSignature className="w-4 h-4" />
        </span>
        <div>
        <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          Documents par client
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.orange.soft}`}>{clients.length}</span>
        </p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Entreprise : une convention signée par son responsable, qui reçoit aussi le récap des convocations et sa
          feuille d’émargement. Particulier : un contrat de formation professionnelle à son nom.
        </p>
        </div>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
        {clients.map((c) => (
          <li key={c.key} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-2 min-w-0 font-bold text-zinc-900 dark:text-zinc-100">
              <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${c.companyId ? ACCENTS.blue.soft : ACCENTS.rose.soft}`}>
                {c.companyId ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
              </span>
              {c.label}
            </span>
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
              {c.companyId ? `${c.learners.length} salarié(s) : ${c.learners.join(', ')}` : 'particulier — contrat individuel'}
            </span>
            {c.companyId && sheets.length > 0 && (
              <span className="ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {sheets.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {s.label} :
                    <a
                      href={`/api/attendance/${s.id}/entreprise?companyId=${c.companyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${sheetLink} ${ACCENTS.emerald.soft}`}
                      title="Feuille signée de l'entreprise (ses salariés)"
                    >
                      <FileCheck2 className="w-3 h-3" /> signée
                    </a>
                    <a
                      href={`/api/attendance/${s.id}/paper?companyId=${c.companyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${sheetLink} ${ACCENTS.sky.soft}`}
                      title="Feuille papier de secours de l'entreprise"
                    >
                      <Printer className="w-3 h-3" /> papier
                    </a>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => sendSheets(c.companyId as string, c.label)}
                  disabled={pending}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold disabled:opacity-50 hover:opacity-80 ${ACCENTS.orange.soft}`}
                  title="Envoyer ses feuilles signées au responsable de l'entreprise"
                >
                  <Mail className="w-3 h-3" /> envoyer
                </button>
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
        <p className={`text-[12px] font-semibold ${message.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}
    </div>
  );
}
