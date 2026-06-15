'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Code2, Info } from 'lucide-react';

function buildSnippet(url: string): string {
  return (
    `<a href="${url}" target="_blank" rel="noopener"\n` +
    `   style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;\n` +
    `          border-radius:10px;font-weight:600;font-family:sans-serif;text-decoration:none">\n` +
    `  S'inscrire à une formation\n` +
    `</a>`
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copié' : label}
    </button>
  );
}

export function InscriptionLink({ orgId }: { orgId: string }) {
  // L'URL absolue dépend du domaine servant l'app → calcul côté client.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const url = origin ? `${origin}/inscription?org=${orgId}` : `…/inscription?org=${orgId}`;
  const snippet = buildSnippet(url);

  return (
    <div className="space-y-5">
      {/* Lien direct */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 min-w-0 text-[12px] font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 truncate">
            {url}
          </code>
          <CopyButton value={url} label="Copier le lien" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Tester
          </a>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Ce lien ouvre votre catalogue de formations <strong>publiées</strong>. Publiez au moins une formation pour qu'elle apparaisse.
        </p>
      </div>

      {/* Snippet bouton */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5" /> Bouton à coller sur votre site
        </p>
        <div className="bg-zinc-950 rounded-xl p-4 overflow-x-auto">
          <pre className="text-[11.5px] font-mono text-zinc-200 leading-relaxed whitespace-pre">{snippet}</pre>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Aperçu :</span>
          <div className="flex items-center gap-2">
            {/* Aperçu visuel du bouton rendu */}
            <span
              className="inline-block px-5 py-3 rounded-[10px] text-white text-[13px] font-semibold"
              style={{ background: '#f97316' }}
            >
              S'inscrire à une formation
            </span>
            <CopyButton value={snippet} label="Copier le code" />
          </div>
        </div>
      </div>
    </div>
  );
}
