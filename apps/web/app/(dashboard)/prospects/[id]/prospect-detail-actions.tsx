'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import {
  Check,
  X,
  Download,
  Loader2,
  ShieldCheck,
  Ban,
  RotateCcw,
  AlertTriangle,
  Clock,
  CircleDashed,
} from 'lucide-react';
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

type DocState = 'missing' | 'rejected' | 'verified' | 'pending' | 'optional';

/** État visuel d'une pièce : couleur, icône, libellé — pour un repérage immédiat. */
function docState(doc: DocChecklistItem): DocState {
  if (doc.reviewStatus === 'verified') return 'verified';
  if (doc.reviewStatus === 'rejected') return 'rejected';
  if (!doc.uploaded) return doc.required ? 'missing' : 'optional';
  return 'pending';
}

const STATE_VISUAL: Record<
  DocState,
  {
    card: string;
    iconWrap: string;
    badge: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  missing: {
    card: 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30',
    iconWrap: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-300',
    badge: 'bg-red-600 text-white',
    label: 'Pièce manquante',
    icon: AlertTriangle,
  },
  rejected: {
    card: 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30',
    iconWrap: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-300',
    badge: 'bg-red-600 text-white',
    label: 'Refusée',
    icon: X,
  },
  pending: {
    card: 'border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/25',
    iconWrap: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300',
    badge: 'bg-amber-500 text-white',
    label: 'À vérifier',
    icon: Clock,
  },
  verified: {
    card: 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/25',
    iconWrap: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300',
    badge: 'bg-emerald-600 text-white',
    label: 'Validé',
    icon: Check,
  },
  optional: {
    card: 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900',
    iconWrap: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500',
    badge: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    label: 'Non fournie · optionnel',
    icon: CircleDashed,
  },
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

  const state = docState(doc);
  const v = STATE_VISUAL[state];
  const Icon = v.icon;

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
    <li className={`rounded-xl border p-3.5 flex items-start gap-3 ${v.card}`}>
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${v.iconWrap}`}>
        <Icon className="w-4 h-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">
            {doc.label}
            {doc.required && <span className="text-red-500" title="Pièce obligatoire"> *</span>}
          </p>
          <span className={`text-[12px] font-semibold h-6 inline-flex items-center px-2.5 rounded-full whitespace-nowrap ${v.badge}`}>{v.label}</span>
        </div>

        {state === 'rejected' && doc.rejectedReason && (
          <p className="mt-1 text-[12px] text-red-700 dark:text-red-300">Motif : {doc.rejectedReason}</p>
        )}

        {/* Actions */}
        <div className="mt-2.5 flex items-center gap-3 flex-wrap">
          {doc.downloadHref && (
            <a
              href={doc.downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Voir la pièce
            </a>
          )}
          {doc.uploaded && doc.reviewStatus !== 'verified' && !rejecting && (
            <>
              <button
                type="button"
                onClick={doVerify}
                disabled={busy}
                className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 inline-flex items-center gap-1 disabled:opacity-40"
              >
                {verify.isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Valider
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="text-[12px] font-medium text-red-600 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" /> Refuser
              </button>
            </>
          )}
          {doc.reviewStatus === 'verified' && (
            <button
              type="button"
              onClick={doUnreview}
              disabled={busy}
              title="Annuler la validation"
              className="text-[12px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 inline-flex items-center gap-1 disabled:opacity-40"
            >
              {unreview.isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Dévalider
            </button>
          )}
          {state === 'missing' && (
            <span className="text-[12px] text-red-700/80 dark:text-red-300/80">
              L’apprenant doit encore fournir ce document.
            </span>
          )}
        </div>

        {rejecting && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif du refus…"
              className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 rounded-lg px-2.5 text-[12px] w-64 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
            />
            <button type="button" onClick={doReject} disabled={busy} className="text-[12px] font-medium text-red-600 hover:text-red-700">
              Confirmer le refus
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="text-[12px] text-zinc-400">
              Annuler
            </button>
          </div>
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

  const requiredMissing = docs.filter((d) => d.required && !d.uploaded).length;
  const rejectedCount = docs.filter((d) => d.reviewStatus === 'rejected').length;
  const pendingCount = docs.filter(
    (d) => d.uploaded && d.reviewStatus !== 'verified' && d.reviewStatus !== 'rejected',
  ).length;
  const verifiedCount = docs.filter((d) => d.reviewStatus === 'verified').length;
  const blocking = requiredMissing + rejectedCount;

  const summary =
    docs.length === 0
      ? null
      : blocking > 0
        ? {
            cls: 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200',
            icon: AlertTriangle,
            text: `${requiredMissing > 0 ? `${requiredMissing} pièce${requiredMissing > 1 ? 's' : ''} manquante${requiredMissing > 1 ? 's' : ''}` : ''}${requiredMissing > 0 && rejectedCount > 0 ? ' · ' : ''}${rejectedCount > 0 ? `${rejectedCount} refusée${rejectedCount > 1 ? 's' : ''}` : ''} — la demande ne peut pas être validée.`,
          }
        : pendingCount > 0
          ? {
              cls: 'border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/25 text-amber-800 dark:text-amber-200',
              icon: Clock,
              text: `${pendingCount} pièce${pendingCount > 1 ? 's' : ''} à vérifier avant de valider la demande.`,
            }
          : {
              cls: 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-800 dark:text-emerald-200',
              icon: ShieldCheck,
              text: 'Toutes les pièces requises sont validées.',
            };

  const SummaryIcon = summary?.icon;

  return (
    <div className="space-y-4">
      {summary && SummaryIcon && (
        <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-medium ${summary.cls}`}>
          <SummaryIcon className="w-4 h-4 flex-shrink-0" />
          <span>{summary.text}</span>
          <span className="ml-auto text-[11px] font-normal opacity-80 tabular-nums">
            {verifiedCount}/{docs.filter((d) => d.required).length || docs.length} validées
          </span>
        </div>
      )}

      <ul className="space-y-2.5">
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
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
          >
            {validate.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Valider la demande
          </button>
          {!rejecting ? (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 px-3 h-10 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition"
            >
              <Ban className="w-4 h-4" /> Refuser
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif du refus…"
                className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-2.5 text-[12px] w-64 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
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
