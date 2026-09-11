'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronDown, Eye, FileSignature, Loader2, Mail, PenLine, User } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { requestLearnerDocumentSignature, sendLearnerDocument } from './actions';

export type DocumentEtat = {
  /** Type de document (convocation, convention, attestation_entree…). */
  type: string;
  label: string;
  signable: boolean;
  url: string;
  /** Dernier envoi par e-mail, ISO. */
  envoyeLe: string | null;
  /** Dernière demande de signature : en attente ou signée. */
  signature: 'pending' | 'signed' | null;
  signatureLe: string | null;
};

export type LearnerRow = {
  learnerId: string;
  dossierId: string;
  name: string;
  email: string | null;
  companyName: string | null;
  documents: DocumentEtat[];
};

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: '2-digit' }).format(
    new Date(iso),
  );

const ERREURS: Record<string, string> = {
  forbidden: 'Vous n’avez pas le droit de gérer les documents de cette séance.',
  session_not_found: 'Séance introuvable.',
  dossier_not_in_session: 'Ce dossier n’est pas rattaché à la séance.',
  build_failed: 'Le document n’a pas pu être généré.',
  no_email: 'Cet apprenant n’a pas d’adresse e-mail.',
  send_failed: 'L’envoi a échoué.',
  not_signable: 'Ce document ne se signe pas.',
  unknown_type: 'Type de document inconnu.',
};

/** Documents d'un stagiaire : aperçu, envoi par e-mail, mise en signature. */
export function LearnerDocuments({ sessionId, learners }: { sessionId: string; learners: LearnerRow[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const agir = (
    action: 'email' | 'signature',
    row: LearnerRow,
    doc: DocumentEtat,
  ) => {
    setMessage(null);
    start(async () => {
      const res =
        action === 'email'
          ? await sendLearnerDocument({ sessionId, dossierId: row.dossierId, type: doc.type })
          : await requestLearnerDocumentSignature({ sessionId, dossierId: row.dossierId, type: doc.type });
      const out = res?.data;
      if (!out?.ok) {
        const raison = out && !out.ok ? out.error : 'send_failed';
        setMessage({ tone: 'err', text: ERREURS[raison] ?? 'L’opération a échoué.' });
        return;
      }
      setMessage({
        tone: 'ok',
        text:
          action === 'email'
            ? `${doc.label} envoyé à ${out.email}.`
            : `${doc.label} envoyé en signature à ${out.email}.`,
      });
      router.refresh();
    });
  };

  const lien = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold hover:opacity-80 disabled:opacity-50';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.rose.soft}`}>
          <User className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Par stagiaire
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.rose.soft}`}>{learners.length}</span>
          </p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Convocation, convention, attestations, certificat et programme : à visualiser, envoyer par e-mail ou mettre en
            signature. Les envois sont horodatés.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
        {learners.map((row) => {
          const envoyes = row.documents.filter((d) => d.envoyeLe || d.signature).length;
          const estOuvert = ouvert === row.dossierId;
          return (
            <li key={row.dossierId} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-2 min-w-0 font-bold text-zinc-900 dark:text-zinc-100">
                  <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${row.companyName ? ACCENTS.blue.soft : ACCENTS.rose.soft}`}>
                    {row.companyName ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  </span>
                  {row.name}
                </span>
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                  {row.companyName ?? 'particulier'}
                  {row.email ? ` · ${row.email}` : ' · sans e-mail'}
                </span>
                <button
                  type="button"
                  onClick={() => setOuvert(estOuvert ? null : row.dossierId)}
                  aria-expanded={estOuvert}
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-2 h-7 text-[12px] font-semibold ${ACCENTS.orange.soft}`}
                >
                  <FileSignature className="w-3.5 h-3.5" />
                  Documents ({row.documents.length})
                  {envoyes > 0 && <span className="tabular-nums opacity-70">· {envoyes} envoyé(s)</span>}
                  <ChevronDown className={`w-3.5 h-3.5 transition ${estOuvert ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {estOuvert && (
                <ul className="mt-2.5 ml-9 space-y-1.5">
                  {row.documents.map((doc) => (
                    <li key={doc.type} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1">
                      <span className="text-[13px] text-zinc-800 dark:text-zinc-200 min-w-[13rem]">{doc.label}</span>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${lien} ${ACCENTS.sky.soft}`}
                      >
                        <Eye className="w-3 h-3" /> Visualiser
                      </a>
                      <button
                        type="button"
                        disabled={pending || !row.email}
                        onClick={() => agir('email', row, doc)}
                        className={`${lien} ${ACCENTS.orange.soft}`}
                        title={row.email ? 'Envoyer par e-mail à l’apprenant' : 'Apprenant sans adresse e-mail'}
                      >
                        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Par e-mail
                      </button>
                      {doc.signable && (
                        <button
                          type="button"
                          disabled={pending || !row.email}
                          onClick={() => agir('signature', row, doc)}
                          className={`${lien} ${ACCENTS.purple.soft}`}
                          title="Archiver le document et envoyer un lien de signature"
                        >
                          <PenLine className="w-3 h-3" /> En signature
                        </button>
                      )}
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {doc.signature === 'signed' && doc.signatureLe ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3 h-3" /> Signé le {dateCourte(doc.signatureLe)}
                          </span>
                        ) : doc.signature === 'pending' ? (
                          <span className="text-purple-600 dark:text-purple-400">En attente de signature</span>
                        ) : doc.envoyeLe ? (
                          `Envoyé le ${dateCourte(doc.envoyeLe)}`
                        ) : (
                          ''
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {message && (
        <p className={`text-[12px] font-semibold ${message.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
