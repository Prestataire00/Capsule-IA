'use client';

import { useRef, useState } from 'react';
import { Check, FileText, Eraser, Loader2 } from 'lucide-react';
import { InfoCallout } from '@/shared/ui/info-callout';
import { recordSignature } from './actions';

type Modality = 'presentiel' | 'distanciel' | 'hybride' | string;

export type SignerContext = {
  readonly signerFullName: string;
  readonly signerKind: 'learner' | 'trainer';
  readonly dossierReference: string;
  readonly formationTitle: string;
  readonly sessionStartsAt: string;
  readonly sessionEndsAt: string;
  readonly sessionModality: Modality;
  readonly organizationName: string;
  readonly tokenExpiresAt: string;
};

type Step =
  | { name: 'preview' }
  | { name: 'sign' }
  | { name: 'submitting' }
  | { name: 'done'; hash: string; signedAt: string }
  | { name: 'error'; message: string };

const formatDateRange = (startIso: string, endIso: string): string => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (sameDay) {
    return `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  }
  return `${dateFmt.format(start)} → ${dateFmt.format(end)}`;
};

const formatExpiry = (iso: string): string => {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

export function SignerForm({
  token,
  context,
}: {
  token: string;
  context: SignerContext;
}) {
  const [step, setStep] = useState<Step>({ name: 'preview' });
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  };
  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
    setHasDrawn(true);
  };
  const stopDraw = () => {
    drawing.current = false;
  };
  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasDrawn(false);
  };

  const submit = async () => {
    if (!canvasRef.current) return;
    setStep({ name: 'submitting' });
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const result = await recordSignature({ token, dataUrl });
    if (result.ok) {
      setStep({ name: 'done', hash: result.hash, signedAt: result.signedAt });
    } else {
      setStep({ name: 'error', message: result.error });
    }
  };

  if (step.name === 'done') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-[400px] text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Merci, c&apos;est signé.
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Signature horodatée par {context.organizationName}.
          </p>
          <p className="text-[11px] text-zinc-400 mt-4 font-mono break-all">
            Hash : {step.hash.slice(0, 16)}…
            <br />
            Horodatage : {new Date(step.signedAt).toISOString()}
          </p>
        </div>
      </div>
    );
  }

  if (step.name === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-[400px] text-center">
          <h1 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-2">
            Erreur lors de la signature
          </h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 font-mono">
            {step.message}
          </p>
          <button
            type="button"
            onClick={() => setStep({ name: 'sign' })}
            className="mt-6 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (step.name === 'sign' || step.name === 'submitting') {
    const isSubmitting = step.name === 'submitting';
    return (
      <div className="flex-1 flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-[480px]">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Signez ci-dessous
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
              Utilisez votre doigt ou votre stylet pour signer dans le cadre.
            </p>
          </div>

          <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
            <canvas
              ref={canvasRef}
              width={464}
              height={200}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={stopDraw}
              onPointerLeave={stopDraw}
              className="w-full h-[200px] touch-none cursor-crosshair"
            />
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={isSubmitting}
            className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 mt-2 transition disabled:opacity-40"
          >
            <Eraser className="w-3 h-3" />
            Effacer
          </button>

          <div className="mt-7 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep({ name: 'preview' })}
              disabled={isSubmitting}
              className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!hasDrawn || isSubmitting}
              onClick={submit}
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSubmitting ? 'Enregistrement…' : 'Valider ma signature'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-[480px]">
        <div className="text-center mb-7">
          <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">
            Bonjour {context.signerFullName}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Émargement
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Vous êtes invité{context.signerKind === 'learner' ? '(e)' : ''} à
            signer la feuille de présence ci-dessous.
          </p>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-zinc-500" />
            <div className="flex-1">
              <p className="text-[15px] font-medium">{context.formationTitle}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                {context.dossierReference}
              </p>
            </div>
          </div>
          <ul className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 mb-1 border-t border-zinc-200/60 dark:border-zinc-800 pt-3">
            <li>· {formatDateRange(context.sessionStartsAt, context.sessionEndsAt)}</li>
            <li>· Modalité : {context.sessionModality}</li>
            <li>· Organisme : {context.organizationName}</li>
          </ul>
        </div>

        <InfoCallout tone="info" className="mb-5">
          Lien valide jusqu&apos;au <strong>{formatExpiry(context.tokenExpiresAt)}</strong>.
          Votre signature sera horodatée, liée à votre IP et à un hash
          cryptographique (preuve audit Qualiopi).
        </InfoCallout>

        <label className="flex items-start gap-2 mb-7 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[13px] text-zinc-700 dark:text-zinc-300">
            J&apos;ai pris connaissance de la feuille de présence et j&apos;accepte
            de la signer électroniquement.
          </span>
        </label>

        <button
          type="button"
          disabled={!acknowledged}
          onClick={() => setStep({ name: 'sign' })}
          className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-3 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-40 disabled:pointer-events-none"
        >
          Signer l&apos;émargement
        </button>
      </div>
    </div>
  );
}
