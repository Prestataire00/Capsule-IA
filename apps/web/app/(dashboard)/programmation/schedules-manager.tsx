'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Plus, Pencil, Trash2, Power, X } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { Button } from '@/shared/ui/button';
import { StatusPill } from '@/shared/ui/status-pill';
import { createSchedule, updateSchedule, toggleSchedule, deleteSchedule } from './actions';

type Anchor =
  | 'first_session_start'
  | 'dossier_start'
  | 'dossier_end'
  | 'last_session_end'
  | 'dossier_created'
  | 'devis_signed'
  | 'convention_signed'
  | 'invoice_paid';
type RecipientKind = 'learner' | 'trainer';

export type ScheduleRow = {
  id: string;
  name: string;
  anchor: Anchor;
  offset_days: number;
  recipient_kind: RecipientKind;
  subject: string;
  body: string;
  attachment_kind: string | null;
  enabled: boolean;
};

// Documents pouvant être joints (documents.kind persistés). '' = aucune pièce jointe.
const ATTACHMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Aucune pièce jointe' },
  { value: 'convention', label: 'Convention de formation' },
  { value: 'attestation', label: 'Attestation de fin de formation' },
  { value: 'certificat', label: 'Certificat de réalisation' },
];
const attachmentLabel = (kind: string | null): string | null =>
  kind ? ATTACHMENT_OPTIONS.find((o) => o.value === kind)?.label ?? kind : null;

const ANCHOR_LABELS: Record<Anchor, string> = {
  first_session_start: 'le début de la 1ʳᵉ session',
  dossier_start: 'le début de la formation',
  dossier_end: 'la fin de la formation',
  last_session_end: 'la fin de la dernière session',
  dossier_created: 'la création du dossier',
  devis_signed: 'la signature du devis',
  convention_signed: 'la signature de la convention',
  invoice_paid: 'le règlement de la facture',
};

// Un événement ne se prévoit pas : on ne peut écrire qu'APRÈS coup.
// Les ancres calendaires, elles, acceptent un décalage négatif (rappel J-7).
const EVENT_ANCHORS: Anchor[] = ['dossier_created', 'devis_signed', 'convention_signed', 'invoice_paid'];

const ANCHOR_GROUPS: Array<{ label: string; anchors: Anchor[] }> = [
  {
    label: 'Dates de formation',
    anchors: ['first_session_start', 'dossier_start', 'dossier_end', 'last_session_end'],
  },
  {
    label: 'Événements du dossier',
    anchors: ['dossier_created', 'devis_signed', 'convention_signed', 'invoice_paid'],
  },
];

const RECIPIENT_LABELS: Record<RecipientKind, string> = {
  learner: 'Apprenant',
  trainer: 'Formateur(s)',
};

const ROW_GRID = 'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_100px_112px] gap-4 px-5';

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
  attachmentKind: string;
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
  attachmentKind: '',
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
      attachmentKind: r.attachment_kind ?? '',
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
      attachmentKind: form.attachmentKind || undefined,
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
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
              {form.id ? 'Modifier la programmation' : 'Nouvelle programmation'}
            </h2>
            <button type="button" onClick={closeForm} aria-label="Fermer" className="w-8 h-8 rounded-md grid place-items-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition">
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
                <option value="before" disabled={EVENT_ANCHORS.includes(form.anchor)}>
                  avant
                </option>
                <option value="after">après</option>
                <option value="same">le jour de</option>
              </select>
              <select
                className={`${inputClass} w-auto`}
                value={form.anchor}
                onChange={(e) => {
                  const anchor = e.target.value as Anchor;
                  setForm({
                    ...form,
                    anchor,
                    direction:
                      EVENT_ANCHORS.includes(anchor) && form.direction === 'before'
                        ? 'after'
                        : form.direction,
                  });
                }}
              >
                {ANCHOR_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.anchors.map((a) => (
                      <option key={a} value={a}>
                        {ANCHOR_LABELS[a]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {EVENT_ANCHORS.includes(form.anchor) && (
                <span className="basis-full text-[11px] text-zinc-500 dark:text-zinc-400">
                  Un événement ne se prévoit pas à l’avance : l’envoi part le jour même ou après.
                </span>
              )}
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

          <FormField
            label="Pièce jointe"
            hint="Joint le dernier document de ce type généré pour le dossier (l'email part même si le document n'existe pas encore)."
          >
            <select
              className={inputClass}
              value={form.attachmentKind}
              onChange={(e) => setForm({ ...form, attachmentKind: e.target.value })}
            >
              {ATTACHMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
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
      ) : rules.length > 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Règle</div>
              <div>Destinataire</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rules.map((r) => (
                <li key={r.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.name}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                      {timingLabel(r.offset_days, r.anchor)}
                      {attachmentLabel(r.attachment_kind) ? ` · pièce jointe : ${attachmentLabel(r.attachment_kind)}` : ''} ·{' '}
                      <span className="italic">{r.subject}</span>
                    </p>
                  </div>
                  <span className="text-zinc-700 dark:text-zinc-300">{RECIPIENT_LABELS[r.recipient_kind]}</span>
                  <div>
                    <StatusPill tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'active' : 'inactive'}</StatusPill>
                  </div>
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      title={r.enabled ? 'Désactiver' : 'Activer'}
                      aria-label={`${r.enabled ? 'Désactiver' : 'Activer'} — ${r.name}`}
                      onClick={() => toggle.execute({ id: r.id, enabled: !r.enabled })}
                      className={`w-8 h-8 rounded-md grid place-items-center hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition ${
                        r.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Modifier"
                      aria-label={`Modifier — ${r.name}`}
                      onClick={() => openEdit(r)}
                      className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Supprimer"
                      aria-label={`Supprimer — ${r.name}`}
                      onClick={() => {
                        if (confirm(`Supprimer la programmation « ${r.name} » ?`)) remove.execute({ id: r.id });
                      }}
                      className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
