'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Plus, Pencil, Trash2, Power, X } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { Button } from '@/shared/ui/button';
import { createSchedule, updateSchedule, toggleSchedule, deleteSchedule } from './actions';

type Anchor = 'first_session_start' | 'dossier_start' | 'dossier_end';
type RecipientKind = 'learner' | 'trainer';

export type ScheduleRow = {
  id: string;
  name: string;
  anchor: Anchor;
  offset_days: number;
  recipient_kind: RecipientKind;
  subject: string;
  body: string;
  enabled: boolean;
};

const ANCHOR_LABELS: Record<Anchor, string> = {
  first_session_start: 'le début de la 1ʳᵉ session',
  dossier_start: 'le début de la formation',
  dossier_end: 'la fin de la formation',
};

const RECIPIENT_LABELS: Record<RecipientKind, string> = {
  learner: 'Apprenant',
  trainer: 'Formateur(s)',
};

type Direction = 'before' | 'after' | 'same';

function offsetToParts(offset: number): { days: number; direction: Direction } {
  if (offset < 0) return { days: -offset, direction: 'before' };
  if (offset > 0) return { days: offset, direction: 'after' };
  return { days: 0, direction: 'same' };
}
function partsToOffset(days: number, direction: Direction): number {
  if (direction === 'before') return -Math.abs(days);
  if (direction === 'after') return Math.abs(days);
  return 0;
}

function timingLabel(offset: number, anchor: Anchor): string {
  const { days, direction } = offsetToParts(offset);
  const anchorLabel = ANCHOR_LABELS[anchor];
  if (direction === 'same') return `Le jour de ${anchorLabel}`;
  return `${days} jour${days > 1 ? 's' : ''} ${direction === 'before' ? 'avant' : 'après'} ${anchorLabel}`;
}

type FormState = {
  id: string | null;
  name: string;
  anchor: Anchor;
  days: number;
  direction: Direction;
  recipientKind: RecipientKind;
  subject: string;
  body: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  anchor: 'first_session_start',
  days: 3,
  direction: 'before',
  recipientKind: 'learner',
  subject: 'Rappel : {formation}',
  body: 'Bonjour {prenom},\n\nNous vous rappelons que votre formation « {formation} » approche : elle débute le {date}.\n\nÀ très bientôt.',
};

export function SchedulesManager({ rules }: { rules: ScheduleRow[] }) {
  const [form, setForm] = useState<FormState | null>(null);

  const create = useAction(createSchedule);
  const update = useAction(updateSchedule);
  const toggle = useAction(toggleSchedule);
  const remove = useAction(deleteSchedule);

  const openCreate = () => setForm({ ...EMPTY_FORM });
  const openEdit = (r: ScheduleRow) => {
    const { days, direction } = offsetToParts(r.offset_days);
    setForm({
      id: r.id,
      name: r.name,
      anchor: r.anchor,
      days,
      direction,
      recipientKind: r.recipient_kind,
      subject: r.subject,
      body: r.body,
    });
  };
  const closeForm = () => setForm(null);

  const handleSave = async () => {
    if (!form) return;
    const payload = {
      name: form.name,
      anchor: form.anchor,
      offsetDays: partsToOffset(form.days, form.direction),
      recipientKind: form.recipientKind,
      subject: form.subject,
      body: form.body,
    };
    const res = form.id
      ? await update.executeAsync({ id: form.id, ...payload })
      : await create.executeAsync(payload);
    if (res?.data?.ok) closeForm();
  };

  const saving = create.isExecuting || update.isExecuting;
  const saveError =
    (create.result?.data && !create.result.data.ok && create.result.data.error) ||
    (update.result?.data && !update.result.data.ok && update.result.data.error) ||
    (create.result?.serverError || update.result?.serverError ? 'Erreur serveur.' : null);

  const canSave =
    form && form.name.trim() && form.subject.trim() && form.body.trim() && !saving;

  return (
    <div className="space-y-6">
      {!form && (
        <Button type="button" variant="brand" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nouvelle programmation
        </Button>
      )}

      {/* Formulaire création / édition */}
      {form && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
              {form.id ? 'Modifier la programmation' : 'Nouvelle programmation'}
            </h2>
            <button type="button" onClick={closeForm} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          <FormField label="Nom de la règle">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex. Rappel avant la formation"
            />
          </FormField>

          <FormField label="Quand envoyer ?">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                max={365}
                className={`${inputClass} w-20`}
                value={form.days}
                disabled={form.direction === 'same'}
                onChange={(e) => setForm({ ...form, days: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className="text-[13px] text-zinc-500">jour(s)</span>
              <select
                className={`${inputClass} w-auto`}
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}
              >
                <option value="before">avant</option>
                <option value="after">après</option>
                <option value="same">le jour de</option>
              </select>
              <select
                className={`${inputClass} w-auto`}
                value={form.anchor}
                onChange={(e) => setForm({ ...form, anchor: e.target.value as Anchor })}
              >
                <option value="first_session_start">le début de la 1ʳᵉ session</option>
                <option value="dossier_start">le début de la formation</option>
                <option value="dossier_end">la fin de la formation</option>
              </select>
            </div>
          </FormField>

          <FormField label="Destinataire">
            <select
              className={inputClass}
              value={form.recipientKind}
              onChange={(e) => setForm({ ...form, recipientKind: e.target.value as RecipientKind })}
            >
              <option value="learner">Apprenant du dossier</option>
              <option value="trainer">Formateur(s) du dossier</option>
            </select>
          </FormField>

          <FormField label="Objet" hint="Variables : {prenom} {nom} {formation} {date}">
            <input
              className={inputClass}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </FormField>

          <FormField label="Corps de l'email" hint="Variables : {prenom} {nom} {formation} {date}">
            <textarea
              className={`${inputClass} min-h-[160px] leading-relaxed`}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </FormField>

          <div className="flex items-center gap-3">
            <Button type="button" variant="brand" onClick={handleSave} disabled={!canSave}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {form.id ? 'Enregistrer' : 'Créer'}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Annuler
            </Button>
            {saveError && <span className="text-[13px] text-rose-600 dark:text-rose-400">{saveError}</span>}
          </div>
        </div>
      )}

      {/* Liste des règles */}
      {rules.length === 0 && !form ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Aucune programmation pour le moment. Créez votre première règle ci-dessus.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-4 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {r.name}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      r.enabled
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {r.enabled ? 'active' : 'inactive'}
                  </span>
                </div>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  {timingLabel(r.offset_days, r.anchor)} · {RECIPIENT_LABELS[r.recipient_kind]} ·{' '}
                  <span className="italic">{r.subject}</span>
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title={r.enabled ? 'Désactiver' : 'Activer'}
                  onClick={() => toggle.execute({ id: r.id, enabled: !r.enabled })}
                  className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    r.enabled ? 'text-emerald-600' : 'text-zinc-400'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Modifier"
                  onClick={() => openEdit(r)}
                  className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Supprimer"
                  onClick={() => {
                    if (confirm(`Supprimer la programmation « ${r.name} » ?`)) remove.execute({ id: r.id });
                  }}
                  className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
