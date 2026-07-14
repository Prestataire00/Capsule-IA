'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Check, X, Download, Loader2, ShieldCheck, Ban, RotateCcw } from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import {
  verifyProspectDocument,
  rejectProspectDocument,
  unreviewProspectDocument,
  validateProspectDemande,
  rejectProspectDemande,
} from './actions';

export type DocChecklistItem = {
  key: string;
  label: string;
  required: boolean;
  uploaded: boolean;
  downloadHref: string | null;
  reviewStatus: 'pending' | 'verified' | 'rejected' | null;
  rejectedReason: string | null;
};

function DocRow({ prospectId, doc }: { prospectId: string; doc: DocChecklistItem }) {
  const router = useRouter();
  const verify = useAction(verifyProspectDocument);
  const reject = useAction(rejectProspectDocument);
  const unreview = useAction(unreviewProspectDocument);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const busy = verify.isExecuting || reject.isExecuting || unreview.isExecuting;

  async function doUnreview() {
    const r = await unreview.executeAsync({ prospectId, docKey: doc.key });
    if (r?.data?.ok) router.refresh();
  }

  const tone =
    doc.reviewStatus === 'verified' ? 'success' : doc.reviewStatus === 'rejected' ? 'danger' : 'neutral';
  const statusLabel =
    doc.reviewStatus === 'verified' ? 'validé' : doc.reviewStatus === 'rejected' ? 'refusée' : 'à vérifier';

  async function doVerify() {
    const r = await verify.executeAsync({ prospectId, docKey: doc.key });
    if (r?.data?.ok) router.refresh();
  }
  async function doReject() {
    if (reason.trim().length < 2) return;
    const r = await reject.executeAsync({ prospectId, docKey: doc.key, reason: reason.trim() });
    if (r?.data?.ok) {
      setRejecting(false);
      setReason('');
      router.refresh();
    }
  }

  return (
    <li className="py-3 px-1 flex items-start justify-between gap-3 text-[13px]">
      <div className="min-w-0">
        <span className="text-zinc-900 dark:text-zinc-100">
          {doc.label}
          {doc.required && <span className="text-red-500"> *</span>}
        </span>
        <div className="mt-0.5 flex items-center gap-2">
          {doc.uploaded ? (
            <StatusPill tone={tone}>{statusLabel}</StatusPill>
          ) : (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">pièce manquante</span>
          )}
          {doc.reviewStatus === 'rejected' && doc.rejectedReason && (
            <span className="text-[11px] text-zinc-500 truncate">— {doc.rejectedReason}</span>
          )}
        </div>
        {rejecting && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif du refus…"
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded px-2 py-1 text-[12px] w-64"
            />
            <button type="button" onClick={doReject} disabled={busy} className="text-[12px] text-red-600 hover:text-red-700">
              Confirmer
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="text-[12px] text-zinc-400">
              Annuler
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {doc.downloadHref && (
          <a
            href={doc.downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> Voir
          </a>
        )}
        {doc.reviewStatus === 'verified' ? (
          <>
            <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Validé
            </span>
            <button
              type="button"
              onClick={doUnreview}
              disabled={busy}
              title="Annuler la validation"
              className="text-[12px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 inline-flex items-center gap-1 disabled:opacity-40"
            >
              {unreview.isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Dévalider
            </button>
          </>
        ) : (
          doc.uploaded &&
          !rejecting && (
            <>
              <button
                type="button"
                onClick={doVerify}
                disabled={busy}
                className="text-[12px] text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 disabled:opacity-40"
              >
                {verify.isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Vérifier
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-40"
              >
                <X className="w-3 h-3" /> Refuser
              </button>
            </>
          )
        )}
      </div>
    </li>
  );
}

export function ProspectDetailActions({
  prospectId,
  validationStatus,
  docs,
  canValidate,
}: {
  prospectId: string;
  validationStatus: 'pending_validation' | 'validated' | 'rejected';
  docs: DocChecklistItem[];
  canValidate: boolean;
}) {
  const router = useRouter();
  const validate = useAction(validateProspectDemande);
  const rejectDemande = useAction(rejectProspectDemande);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function doValidate() {
    const r = await validate.executeAsync({ prospectId });
    if (r?.data?.ok) router.refresh();
  }
  async function doRejectDemande() {
    if (reason.trim().length < 2) return;
    const r = await rejectDemande.executeAsync({ prospectId, reason: reason.trim() });
    if (r?.data?.ok) {
      setRejecting(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 border-y border-zinc-200/60 dark:border-zinc-800">
        {docs.length === 0 ? (
          <li className="py-3 px-1 text-[13px] text-zinc-500">Aucune pièce requise pour cette demande.</li>
        ) : (
          docs.map((d) => <DocRow key={d.key} prospectId={prospectId} doc={d} />)
        )}
      </ul>

      {validationStatus === 'validated' ? (
        <StatusPill tone="success">Demande validée</StatusPill>
      ) : validationStatus === 'rejected' ? (
        <StatusPill tone="danger">Demande refusée</StatusPill>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={doValidate}
            disabled={!canValidate || validate.isExecuting}
            title={canValidate ? '' : 'Vérifiez toutes les pièces requises d’abord'}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-lg"
          >
            {validate.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Valider la demande
          </button>
          {!rejecting ? (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-2 text-[13px] text-red-600 hover:text-red-700 px-3 py-2"
            >
              <Ban className="w-4 h-4" /> Refuser
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif du refus…"
                className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded px-2 py-1.5 text-[12px] w-64"
              />
              <button type="button" onClick={doRejectDemande} disabled={rejectDemande.isExecuting} className="text-[12px] text-red-600 hover:text-red-700">
                Confirmer
              </button>
              <button type="button" onClick={() => setRejecting(false)} className="text-[12px] text-zinc-400">
                Annuler
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
