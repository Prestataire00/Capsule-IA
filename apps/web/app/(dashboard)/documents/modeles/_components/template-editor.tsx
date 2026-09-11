'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import { ArrowLeft, Save, Trash2, Loader2, AlertCircle, Eye, Sparkles } from 'lucide-react';
import { RichTextEditor } from '@/features/documents/editor/rich-text-editor';
import { pillsToTokens } from '@/features/documents/editor/template-variable-node';
import { DOCUMENT_CSS } from '@/features/documents/document-styles';
import { saveTemplate, deleteTemplate, previewTemplateWithDossier } from '../actions';
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
  formationId: string | null;
  categoryId: string | null;
};

export type FormationChoice = { id: string; title: string };
export type CategoryChoice = { id: string; name: string };
export type DossierChoice = { id: string; label: string };

export function TemplateEditor({
  template,
  formations = [],
  categories = [],
  dossiers = [],
}: {
  template?: EditorTemplate;
  formations?: FormationChoice[];
  categories?: CategoryChoice[];
  dossiers?: DossierChoice[];
}) {
  const router = useRouter();
  const { executeAsync: runSave } = useAction(saveTemplate);
  const { executeAsync: runDelete } = useAction(deleteTemplate);
  const { executeAsync: runPreview } = useAction(previewTemplateWithDossier);

  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? 'convention');
  const [title, setTitle] = useState(template?.title ?? '');
  const [formationId, setFormationId] = useState<string>(template?.formationId ?? '');
  const [categoryId, setCategoryId] = useState<string>(template?.categoryId ?? '');
  const [html, setHtml] = useState(template?.contentHtml ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Aperçu "valeurs réelles" : rendu du modèle avec les données d'un dossier.
  const [previewDossier, setPreviewDossier] = useState<string>(dossiers[0]?.id ?? '');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewMissing, setPreviewMissing] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);

  async function handlePreview() {
    if (!previewDossier) return;
    setPreviewing(true);
    setPreviewHtml(null);
    const res = await runPreview({ contentHtml: pillsToTokens(html), dossierId: previewDossier });
    setPreviewing(false);
    const out = res?.data;
    if (out?.ok) {
      setPreviewHtml(out.html);
      setPreviewMissing(out.missing ?? []);
    } else {
      setPreviewHtml('<p style="color:#dc2626">Aperçu impossible (dossier introuvable).</p>');
      setPreviewMissing([]);
    }
  }

  async function handleSave() {
    setError(null);
    // Reconvertit les pastilles en tokens {slug} pour le pipeline de rendu.
    const contentHtml = pillsToTokens(html);
    if (!title.trim() || !contentHtml.trim()) {
      setError('Titre et contenu requis.');
      return;
    }
    setSaving(true);
    const res = await runSave({
      id: template?.id ?? null,
      kind,
      title,
      contentHtml,
      formationId: formationId || null,
      categoryId: categoryId || null,
    });
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
              className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg inline-flex items-center gap-1.5 px-3 h-10 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition inline-flex items-center gap-2 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-[13px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 block mb-1.5">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as TemplateKind)}
                className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
              >
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 block mb-1.5">Titre</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Convention de formation"
                className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 block mb-1.5">
              Formation associée (optionnel)
            </span>
            <select
              value={formationId}
              onChange={(e) => setFormationId(e.target.value)}
              className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="">Modèle global (toutes formations)</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 block mb-1.5">
              Catégorie (optionnel)
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="">Non classé</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 block mb-1.5">
              Contenu du document
            </span>
            <p className="text-[11px] text-zinc-400 mb-2">
              Rédigez comme un traitement de texte. Cliquez une variable dans le panneau pour l&apos;insérer
              sous forme de pastille ; elle sera remplacée par la vraie valeur à la génération.
            </p>
            <RichTextEditor value={html} onChange={setHtml} />
          </div>

          {/* Aperçu valeurs réelles */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Aperçu avec valeurs réelles
              </span>
              {dossiers.length === 0 ? (
                <span className="text-[12px] text-zinc-400">Aucun dossier disponible.</span>
              ) : (
                <>
                  <select
                    value={previewDossier}
                    onChange={(e) => setPreviewDossier(e.target.value)}
                    className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-2.5 text-[12px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
                  >
                    {dossiers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={previewing}
                    className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold px-3 h-9 rounded-lg transition inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Générer l&apos;aperçu
                  </button>
                </>
              )}
            </div>

            {previewMissing.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Variables sans valeur dans ce dossier : {previewMissing.join(', ')}
              </p>
            )}

            {previewHtml !== null && (
              <>
                <style>{DOCUMENT_CSS}</style>
                <article
                  className="doc-sheet bg-white text-zinc-900 rounded-md border border-zinc-200 shadow-sm px-8 py-8 max-w-[760px] mx-auto"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </>
            )}
          </div>
      </div>
    </div>
  );
}
