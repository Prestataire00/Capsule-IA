// ARCHETYPE: workflow
// Justification: signature électronique apprenant — focus extrême, 1 seule action, pas de nav.

'use client';

import { useRef, useState } from 'react';
import { Check, FileText, Download, Eraser } from 'lucide-react';
import { InfoCallout } from '@/shared/ui/info-callout';

export default function SignerPage() {
  const [step, setStep] = useState<'preview' | 'sign' | 'done'>('preview');
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

  if (step === 'done') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-[400px] text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Merci, c'est signé.</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Une copie vous a été envoyée par email à <span className="font-mono">alice.martin@acme-sas.fr</span>.
          </p>
          <p className="text-[11px] text-zinc-400 mt-4 font-mono">
            Hash document : a1b2c3d4e5f6…<br />
            Horodatage : 2026-05-10 16:42:08 UTC
          </p>
        </div>
      </div>
    );
  }

  if (step === 'sign') {
    return (
      <div className="flex-1 flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-[480px]">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Signez ci-dessous</h1>
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
            className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 mt-2 transition"
          >
            <Eraser className="w-3 h-3" />
            Effacer
          </button>

          <div className="mt-7 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep('preview')}
              className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!hasDrawn}
              onClick={() => setStep('done')}
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm disabled:opacity-40 disabled:pointer-events-none"
            >
              Valider ma signature
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
            Bonjour Alice
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Convention de formation</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Vous êtes invitée à signer le document ci-dessous.
          </p>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-zinc-500" />
            <div className="flex-1">
              <p className="text-[15px] font-medium">Convention de formation</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                DOS-2026-0001 · Comptabilité Niveau 2
              </p>
            </div>
          </div>
          <ul className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 mb-3 border-t border-zinc-200/60 dark:border-zinc-800 pt-3">
            <li>· Période : 01/09/2026 → 15/12/2026</li>
            <li>· 70 heures · présentiel · Acme Formation</li>
            <li>· Financement OPCO Atlas — 3 500 €</li>
          </ul>
          <button
            type="button"
            className="text-[11px] text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1 hover:underline transition"
          >
            <Download className="w-3 h-3" />
            Télécharger le PDF
          </button>
        </div>

        <InfoCallout tone="info" className="mb-5">
          Lien valide jusqu'au <strong>25/05/2026</strong>. Votre signature sera horodatée et liée au hash du document.
        </InfoCallout>

        <label className="flex items-start gap-2 mb-7 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[13px] text-zinc-700 dark:text-zinc-300">
            J'ai pris connaissance du document et j'accepte de le signer électroniquement.
          </span>
        </label>

        <button
          type="button"
          disabled={!acknowledged}
          onClick={() => setStep('sign')}
          className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-3 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-40 disabled:pointer-events-none"
        >
          Signer le document
        </button>
      </div>
    </div>
  );
}
