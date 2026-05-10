'use client';

import { useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';

export function CopyInscriptionLink({
  formationId,
  variant = 'compact',
  className = '',
}: {
  formationId: string;
  variant?: 'compact' | 'full';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/inscription?formation=${formationId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title="Copier le lien public de pré-inscription"
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition shadow-sm border ${
          copied
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/40'
            : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200/60 dark:border-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-200 dark:hover:border-violet-900/60'
        } ${className}`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" />
            Lien copié
          </>
        ) : (
          <>
            <Link2 className="w-3.5 h-3.5" />
            Copier le lien d'inscription
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copier le lien de pré-inscription"
      aria-label="Copier le lien de pré-inscription"
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition border ${
        copied
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/40'
          : 'bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:border-violet-200 dark:hover:border-violet-900/60'
      } ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          Copié
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          Lien
        </>
      )}
    </button>
  );
}
