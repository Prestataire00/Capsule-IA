'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eraser, Loader2 } from 'lucide-react';
import { signDocument } from './actions';

type Step =
  | { name: 'sign' }
  | { name: 'submitting' }
  | { name: 'done' }
  | { name: 'error'; message: string };

const ERROR_LABELS: Record<string, string> = {
  already_signed: 'Ce document est déjà signé.',
  not_found: 'Document introuvable.',
  not_signable: 'Ce document ne nécessite pas de signature.',
  invalid_format: 'Signature invalide, recommencez.',
  invalid_size: 'Signature trop volumineuse, recommencez.',
  upload_failed: "L'enregistrement de la signature a échoué.",
  unauthenticated: 'Session expirée, rouvrez votre espace.',
};

export function DocumentSignerForm({
  token,
  docId,
  backHref,
}: {
  token: string;
  docId: string;
  backHref: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'sign' });
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
    const result = await signDocument({ token, docId, dataUrl });
    if (result.ok) setStep({ name: 'done' });
    else setStep({ name: 'error', message: ERROR_LABELS[result.error] ?? 'Une erreur est survenue.' });
  };

  if (step.name === 'done') {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
        <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
        <h1 className="text-[20px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100 mb-2">Merci, c&apos;est signé.</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-6">Votre signature a été horodatée et enregistrée.</p>
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
        >
          Retour aux documents
        </button>
      </div>
    );
  }

  const isSubmitting = step.name === 'submitting';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-6">
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4 text-center">
        Signez dans le cadre avec votre doigt ou votre stylet.
      </p>
      <div className="border border-zinc-200/70 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 max-w-[480px] mx-auto">
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
      <div className="max-w-[480px] mx-auto">
        <button
          type="button"
          onClick={clear}
          disabled={isSubmitting}
          className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 mt-2 transition disabled:opacity-40"
        >
          <Eraser className="w-3 h-3" />
          Effacer
        </button>

        {step.name === 'error' && (
          <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-3">{step.message}</p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            disabled={isSubmitting}
            className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!hasDrawn || isSubmitting}
            onClick={submit}
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'Enregistrement…' : 'Valider ma signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
