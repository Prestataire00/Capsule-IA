'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Zone de signature au doigt ou au stylet.
 *
 * La résolution du canevas suit sa taille affichée et la densité de l'écran :
 * un canevas de taille fixe étiré en CSS décalait le trait du doigt sur
 * téléphone (défaut relevé chez SoSafe comme dans l'ancienne page Capsule).
 */
export type SignaturePadHandle = {
  /** PNG de la signature, ou null si rien n'a été tracé. */
  toDataUrl: () => string | null;
  clear: () => void;
  /** Alternative au tracé : écrit le nom de la personne dans la zone. */
  writeName: (nom: string) => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { onInk: (hasInk: boolean) => void; height?: number; label?: string }>(
  function SignaturePad({ onInk, height = 200, label = 'Zone de signature' }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const ink = useRef(false);
    const onInkRef = useRef(onInk);
    onInkRef.current = onInk;

    const setInk = (v: boolean) => {
      if (ink.current !== v) {
        ink.current = v;
        onInkRef.current(v);
      }
    };

    useEffect(() => {
      const c = canvas.current;
      if (!c) return;
      const resize = () => {
        const r = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.max(1, Math.round(r.width * dpr));
        c.height = Math.max(1, Math.round(r.height * dpr));
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#18181b';
        }
        setInk(false);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(c);
      return () => ro.disconnect();
    }, []);

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    useImperativeHandle(ref, () => ({
      toDataUrl: () => (ink.current && canvas.current ? canvas.current.toDataURL('image/png') : null),
      clear: () => {
        const c = canvas.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.restore();
        setInk(false);
      },
      writeName: (nom: string) => {
        const c = canvas.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx || !nom.trim()) return;
        const r = c.getBoundingClientRect();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#18181b';
        ctx.font = 'italic 30px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nom.trim(), r.width / 2, r.height / 2, r.width - 24);
        ctx.restore();
        setInk(true);
      },
    }));

    return (
      <canvas
        ref={canvas}
        aria-label={label}
        role="img"
        style={{ height }}
        className="w-full block touch-none cursor-crosshair bg-white rounded-lg"
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
    );
  },
);
