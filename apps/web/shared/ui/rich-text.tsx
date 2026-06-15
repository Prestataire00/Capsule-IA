// ARCHETYPE: shared
'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, List } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Command = 'bold' | 'italic' | 'insertUnorderedList';

const TOOLS: { cmd: Command; icon: React.ReactNode; label: string }[] = [
  { cmd: 'bold', icon: <Bold className="w-3.5 h-3.5" />, label: 'Gras' },
  { cmd: 'italic', icon: <Italic className="w-3.5 h-3.5" />, label: 'Italique' },
  { cmd: 'insertUnorderedList', icon: <List className="w-3.5 h-3.5" />, label: 'Liste à puces' },
];

/**
 * Éditeur de texte enrichi minimal (contentEditable + execCommand).
 * Non contrôlé : le DOM est la source de vérité pendant la frappe (évite la perte
 * de curseur d'un contentEditable contrôlé) ; `onChange` remonte le HTML à chaque saisie.
 * `value` n'est appliqué qu'au montage et lorsqu'il diffère du contenu courant (reset/edit).
 */
export function RichText({
  value,
  onChange,
  placeholder,
  minHeight = 96,
  id,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
    // Volontairement sans dépendance `value` autre qu'au montage / reset externe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const exec = (cmd: Command) => {
    ref.current?.focus();
    document.execCommand(cmd, false);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus-within:border-violet-300 dark:focus-within:border-violet-800 focus-within:ring-2 focus-within:ring-violet-500/10 transition">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            title={t.label}
            aria-label={t.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(t.cmd)}
            className="w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition"
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div
        id={id}
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        style={{ minHeight }}
        className={cn(
          'px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 outline-none',
          'prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-400',
        )}
      />
    </div>
  );
}
