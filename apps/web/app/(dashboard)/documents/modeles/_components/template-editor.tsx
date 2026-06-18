'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import { ArrowLeft, Save, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { TEMPLATE_VARIABLES } from '@/features/documents/templates/variables';
import { saveTemplate, deleteTemplate } from '../actions';
import {
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
  type TemplateKind,
} from '../schema';

export type EditorTemplate = {
  id: string;
  kind: TemplateKind;
  title: string;
  contentHtml: string;
};

export function TemplateEditor({ template }: { template?: EditorTemplate }) {
  const router = useRouter();
  const { executeAsync: runSave } = useAction(saveTemplate);
  const { executeAsync: runDelete } = useAction(deleteTemplate);

  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? 'convention');
  const [title, setTitle] = useState(template?.title ?? '');
  const [html, setHtml] = useState(template?.contentHtml ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(slug: string) {
    const ta = taRef.current;
    const token = `{${slug}}`;
    if (!ta) {
      setHtml((h) => h + token);
      return;
    }
    const start = ta.selectionStart ?? html.length;
    const end = ta.selectionEnd ?? html.length;
    const next = html.slice(0, start) + token + html.slice(end);
    setHtml(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + token.length;
    });
  }

  async function handleSave() {
    setError(null);
    if (!title.trim() || !html.trim()) {
      setError('Titre et contenu requis.');
      return;
    }
    setSaving(true);
    const res = await runSave({ id: template?.id ?? null, kind, title, contentHtml: html });
    setSaving(false);
    const out = res?.data;
    if (out?.ok) {
      router.push('/documents/modeles');
      router.refresh();
      return;
    }
    const details = out && 'details' in out ? out.details : undefined;
    setError(details ?? "L'enregistrement a échoué.");
  }

  async function handleDelete() {
    if (!template) return;
    if (!confirm('Supprimer ce modèle ?')) return;
    setSaving(true);
    const res = await runDelete({ id: template.id });
    setSaving(false);
    if (res?.data?.ok) {
      router.push('/documents/modeles');
      router.refresh();
    } else {
      setError('La suppression a échoué.');
    }
  }

  const groups = [...new Set(TEMPLATE_VARIABLES.map((v) => v.group))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/documents/modeles"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Modèles
        </Link>
        <div className="flex items-center gap-2">
          {template && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="text-[13px] text-zinc-500 hover:text-red-600 inline-flex items-center gap-1.5 px-3 py-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-1.5">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as TemplateKind)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
              >
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-1.5">Titre</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Convention de formation"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-1.5">
              Contenu (HTML, variables entre accolades)
            </span>
            <textarea
              ref={taRef}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={22}
              spellCheck={false}
              className="w-full font-mono text-[12px] bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 leading-relaxed"
              placeholder="<h1>{formation_titre}</h1> ..."
            />
          </label>

          <details className="border border-zinc-200/60 dark:border-zinc-800 rounded-md">
            <summary className="text-[12px] text-zinc-600 dark:text-zinc-300 px-3 py-2 cursor-pointer select-none">
              Aperçu (variables non remplacées)
            </summary>
            {/* eslint-disable-next-line react/no-danger */}
            <div
              className="doc-preview prose prose-sm dark:prose-invert max-w-none px-4 py-3 border-t border-zinc-200/60 dark:border-zinc-800"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </details>
        </div>

        <aside className="space-y-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Variables</p>
          <p className="text-[11px] text-zinc-400">Cliquez pour insérer.</p>
          {groups.map((g) => (
            <div key={g}>
              <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 mb-1">{g}</p>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.filter((v) => v.group === g).map((v) => (
                  <button
                    key={v.slug}
                    type="button"
                    onClick={() => insertVariable(v.slug)}
                    title={v.label}
                    className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-100 dark:hover:bg-violet-900/40 text-zinc-600 dark:text-zinc-300 rounded px-1.5 py-0.5"
                  >
                    {v.slug}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
