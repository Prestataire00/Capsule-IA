'use client';
// ARCHETYPE: command
// Bouton « copier un lien public » générique (origin + path). Réutilisé pour le
// lien catalogue (/catalogue?org=…) et les liens programme (/catalogue/<id>).

import { useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';

export function CopyPublicLink({
  path,
  label = 'Copier le lien',
  className = '',
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
        copied
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-zinc-200/60 bg-white text-zinc-700 hover:border-violet-200 hover:text-violet-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
      } ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {copied ? 'Lien copié' : label}
    </button>
  );
}
