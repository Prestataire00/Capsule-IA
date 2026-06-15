'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import {
  Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Loader2, Save, Eye, EyeOff, X,
} from 'lucide-react';
import { QuestionRenderer } from '@/features/questionnaire/question-renderer';
import {
  templateFormSchema,
  toRuntimeSchema,
  emptyQuestionDraft,
  QUESTION_TYPES,
  TEMPLATE_KINDS,
  type TemplateFormValues,
  type QuestionDraft,
  type QuestionType,
} from '@/features/questionnaire/template.schema';
import { saveQuestionnaireTemplate, generateQuestionnaireWithAI } from './actions';

const inputClass =
  'w-full rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-300';

export function TemplateEditor({ initial }: { initial: TemplateFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<TemplateFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [isSaving, startSaving] = useTransition();

  const { executeAsync: runSave } = useAction(saveQuestionnaireTemplate);
  const { executeAsync: runAI, status: aiStatus } = useAction(generateQuestionnaireWithAI);
  const aiLoading = aiStatus === 'executing';

  const patch = (p: Partial<TemplateFormValues>) => setValues((v) => ({ ...v, ...p }));
  const patchQ = (i: number, p: Partial<QuestionDraft>) =>
    setValues((v) => ({ ...v, questions: v.questions.map((q, j) => (j === i ? { ...q, ...p } : q)) }));
  const addQ = () => setValues((v) => ({ ...v, questions: [...v.questions, emptyQuestionDraft(v.questions.length)] }));
  const removeQ = (i: number) =>
    setValues((v) => ({ ...v, questions: v.questions.filter((_, j) => j !== i) }));
  const moveQ = (i: number, dir: -1 | 1) =>
    setValues((v) => {
      const next = [...v.questions];
      const j = i + dir;
      if (j < 0 || j >= next.length) return v;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...v, questions: next };
    });

  const onGenerate = async () => {
    setError(null);
    const res = await runAI({ kind: values.kind, context: aiContext });
    if (res?.data?.ok) {
      patch({ title: values.title || res.data.title, questions: res.data.questions });
    } else {
      setError(
        res?.data?.error === 'no_api_key'
          ? "Génération IA indisponible (clé API non configurée)."
          : "La génération IA a échoué, réessayez.",
      );
    }
  };

  const onSave = () => {
    setError(null);
    const parsed = templateFormSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }
    startSaving(async () => {
      const res = await runSave(parsed.data);
      if (res?.data?.ok) {
        router.push('/questionnaires');
        router.refresh();
      } else {
        setError("L'enregistrement a échoué.");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-5">
        {/* Métadonnées */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Titre</span>
              <input value={values.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Analyse des besoins…" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Type</span>
              <select value={values.kind} onChange={(e) => patch({ kind: e.target.value as TemplateFormValues['kind'] })} className={inputClass}>
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Message de remerciement</span>
            <input value={values.thankYou} onChange={(e) => patch({ thankYou: e.target.value })} className={inputClass} />
          </label>
        </section>

        {/* Questions */}
        <section className="space-y-3">
          {values.questions.map((q, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 flex items-center justify-center text-[11px] font-medium flex-shrink-0 mt-1">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0 space-y-3">
                  <input
                    value={q.label}
                    onChange={(e) => patchQ(i, { label: e.target.value })}
                    placeholder="Intitulé de la question"
                    className={inputClass}
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-[1fr_120px_auto] gap-2 items-center">
                    <select value={q.type} onChange={(e) => patchQ(i, { type: e.target.value as QuestionType })} className={inputClass}>
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <input
                      value={q.id}
                      onChange={(e) => patchQ(i, { id: e.target.value })}
                      placeholder="id_question"
                      className={`${inputClass} font-mono text-[12px]`}
                    />
                    <label className="inline-flex items-center gap-1.5 text-[12px] text-zinc-600 dark:text-zinc-400 px-1">
                      <input type="checkbox" checked={q.required} onChange={(e) => patchQ(i, { required: e.target.checked })} className="accent-orange-500" />
                      Obligatoire
                    </label>
                  </div>

                  {q.type === 'rating' && (
                    <label className="inline-flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                      Échelle de 1 à
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={q.max}
                        onChange={(e) => patchQ(i, { max: Number(e.target.value) })}
                        className={`${inputClass} w-20`}
                      />
                    </label>
                  )}

                  {q.type === 'choice' && (
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            value={opt}
                            onChange={(e) => patchQ(i, { options: q.options.map((o, oj) => (oj === oi ? e.target.value : o)) })}
                            placeholder={`Option ${oi + 1}`}
                            className={inputClass}
                          />
                          <button type="button" onClick={() => patchQ(i, { options: q.options.filter((_, oj) => oj !== oi) })} className="text-zinc-400 hover:text-rose-500 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => patchQ(i, { options: [...q.options, ''] })} className="text-[12px] text-orange-600 hover:underline inline-flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Ajouter une option
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button type="button" onClick={() => moveQ(i, -1)} disabled={i === 0} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => moveQ(i, 1)} disabled={i === values.questions.length - 1} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => removeQ(i)} disabled={values.questions.length === 1} className="text-zinc-400 hover:text-rose-500 p-1 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addQ} className="w-full border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl py-3 text-[13px] text-zinc-500 hover:text-orange-600 hover:border-orange-300 transition inline-flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Ajouter une question
          </button>
        </section>

        {error && <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setShowPreview((s) => !s)} className="text-[13px] text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100">
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? 'Masquer' : 'Aperçu'}
          </button>
          <button type="button" onClick={onSave} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2 disabled:opacity-50">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer le questionnaire
          </button>
        </div>

        {showPreview && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium px-5 pt-4">Aperçu</p>
            <QuestionRenderer questions={toRuntimeSchema(values).questions} />
          </section>
        )}
      </div>

      {/* Panneau IA */}
      <aside className="space-y-3">
        <div className="bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/30 dark:to-zinc-900 border border-violet-200/60 dark:border-violet-900/40 rounded-xl shadow-sm p-5 lg:sticky lg:top-6">
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-500" /> Générer avec l'IA
          </p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
            Décrivez la formation : l'IA propose des questions adaptées au type sélectionné. Vous pourrez tout ajuster.
          </p>
          <textarea
            value={aiContext}
            onChange={(e) => setAiContext(e.target.value)}
            rows={4}
            placeholder="Ex : formation Excel perfectionnement, 2 jours, public assistants administratifs…"
            className={inputClass}
          />
          <button type="button" onClick={onGenerate} disabled={aiLoading} className="mt-3 w-full bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {aiLoading ? 'Génération…' : 'Générer les questions'}
          </button>
          <p className="text-[11px] text-zinc-400 mt-2">Remplace les questions actuelles.</p>
        </div>
      </aside>
    </div>
  );
}
