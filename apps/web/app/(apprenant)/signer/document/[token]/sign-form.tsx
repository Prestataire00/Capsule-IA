'use client';

import { useRef, useState } from 'react';
import { Check, Eraser, Loader2 } from 'lucide-react';
import { submitDocumentSignature } from './actions';

type Step = { name: 'sign' } | { name: 'submitting' } | { name: 'done' } | { name: 'error'; message: string };

const ERROR_LABELS: Record<string, string> = {
  invalid: 'Lien de signature invalide.',
  expired: 'Ce lien de signature a expiré.',
  not_found: 'Demande de signature introuvable.',
  invalid_format: 'Signature invalide, recommencez.',
  invalid_size: 'Signature trop volumineuse, recommencez.',
  upload_failed: "L'enregistrement de la signature a échoué.",
  db_update_failed: "L'enregistrement a échoué, réessayez.",
};

export function SignForm({ token }: { token: string }) {
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
    const result = await submitDocumentSignature({ token, dataUrl });
    if (result.ok) setStep({ name: 'done' });
    else setStep({ name: 'error', message: ERROR_LABELS[result.error] ?? 'Une erreur est survenue.' });
  };

  if (step.name === 'done') {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Merci, c&apos;est signé.</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Votre signature a été horodatée et enregistrée.</p>
      </div>
    );
  }

  const isSubmitting = step.name === 'submitting';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-6">
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4 text-center">
        Signez dans le cadre avec votre doigt ou votre souris.
      </p>
      <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden bg-white max-w-[480px] mx-auto">
        <canvas
          ref={canvasRef}
          width={464}
          height={200}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={stopDraw}
          onPointerLeave={stopDraw}
          className="w-full h-[200px] touch-none cursor-crosshair bg-white"
        />
      </div>
      <div className="max-w-[480px] mx-auto flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={clear}
          disabled={isSubmitting}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Eraser className="w-3.5 h-3.5" />
          Effacer
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!hasDrawn || isSubmitting}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-lg shadow-sm inline-flex items-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Signer
        </button>
      </div>
      {step.name === 'error' && <p className="text-[12px] text-red-600 text-center mt-3">{step.message}</p>}
    </div>
  );
}
