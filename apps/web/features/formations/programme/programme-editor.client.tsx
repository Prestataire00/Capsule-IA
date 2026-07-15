'use client';
// ARCHETYPE: workflow
// Éditeur du Programme de formation : panneau de contrôle (thème, en-tête,
// sections structurées, pied de page) + aperçu live du gabarit fidèle. 100 %
// éditable — chaque changement se reflète immédiatement dans <ProgrammeDocument>.

import { useState, useTransition, type ReactNode } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Save, ExternalLink } from 'lucide-react';
import { RichTextEditor } from '@/features/documents/editor/rich-text-editor';
import { ProgrammeDocument } from './programme-document';
import { PrintProgrammeButton } from './print-button.client';
import { saveProgramme } from './actions';
import type {
  KeyValueRow,
  MetaIcon,
  Programme,
  ProgrammeModule,
  ProgrammeSection,
  ProgrammeSectionType,
  ScheduleRow,
} from './types';

const META_ICONS: { value: MetaIcon; label: string }[] = [
  { value: 'clock', label: 'Durée' },
  { value: 'calendar', label: 'Dates' },
  { value: 'location', label: 'Lieu' },
  { value: 'remote', label: 'Distanciel' },
  { value: 'users', label: 'Effectif' },
  { value: 'tools', label: 'Outils' },
  { value: 'euro', label: 'Tarif' },
  { value: 'award', label: 'Certif.' },
];

const FONTS: { value: string; label: string }[] = [
  { value: 'var(--font-sans), Inter, system-ui, sans-serif', label: 'Inter (défaut)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia (serif)' },
  { value: '"Trebuchet MS", Verdana, sans-serif', label: 'Trebuchet' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Courier New", monospace', label: 'Courier (mono)' },
];

const COLOR_FIELDS: { key: keyof Programme['theme']; label: string }[] = [
  { key: 'primaryColor', label: 'Bandeaux / en-tête' },
  { key: 'secondaryColor', label: 'Cartes de module' },
  { key: 'accentColor', label: 'Accent (libellés)' },
  { key: 'onPrimaryColor', label: 'Texte sur violet' },
  { key: 'surfaceColor', label: 'Fond de bloc' },
  { key: 'surfaceAltColor', label: 'Fond alterné' },
  { key: 'textColor', label: 'Texte' },
  { key: 'mutedColor', label: 'Texte discret' },
  { key: 'borderColor', label: 'Bordures' },
];

// ── Primitives de champ ────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none focus:border-violet-400';

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}
function Area({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea className={inputCls} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />;
}
/** Édite un string[] via une textarea (une ligne = un élément). */
function Lines({ value, onChange, rows = 4 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <textarea
      className={inputCls}
      rows={rows}
      value={value.join('\n')}
      onChange={(e) => onChange(e.target.value.split('\n').map((l) => l.replace(/^[-•]\s*/, '')))}
    />
  );
}

function Collapse({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-zinc-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-semibold text-zinc-800">{title}</summary>
      <div className="space-y-3 border-t border-zinc-100 px-4 py-3">{children}</div>
    </details>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
    >
      {children}
    </button>
  );
}

// ── Éditeurs de section par type ───────────────────────────────────────────
function KeyValueEditor({ rows, onChange }: { rows: KeyValueRow[]; onChange: (r: KeyValueRow[]) => void }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-zinc-200 p-2">
          <div className="mb-1 flex items-center gap-2">
            <input
              className={inputCls + ' font-medium'}
              value={r.label}
              placeholder="Libellé"
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <IconBtn title="Supprimer la ligne" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
          <Area value={r.value} rows={2} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { label: '', value: '' }])}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-700"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
      </button>
    </div>
  );
}

function ScheduleEditor({ rows, onChange }: { rows: ScheduleRow[]; onChange: (r: ScheduleRow[]) => void }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={inputCls + ' w-32'}
            value={r.time}
            placeholder="9h00 – 9h15"
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
          />
          <input
            className={inputCls}
            value={r.label}
            placeholder="Contenu"
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <input
            className={inputCls + ' w-24'}
            value={r.duration}
            placeholder="15 min"
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))}
          />
          <IconBtn title="Supprimer" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { time: '', label: '', duration: '' }])}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-700"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
      </button>
    </div>
  );
}

function ModulesEditor({
  modules,
  onChange,
}: {
  modules: ProgrammeModule[];
  onChange: (m: ProgrammeModule[]) => void;
}) {
  const setMod = (i: number, next: ProgrammeModule) => onChange(modules.map((m, j) => (j === i ? next : m)));
  return (
    <div className="space-y-3">
      {modules.map((m, i) => (
        <div key={i} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              className={inputCls + ' w-24'}
              value={m.code}
              placeholder="MODULE 1"
              onChange={(e) => setMod(i, { ...m, code: e.target.value })}
            />
            <input
              className={inputCls}
              value={m.title}
              placeholder="Titre du module"
              onChange={(e) => setMod(i, { ...m, title: e.target.value })}
            />
            <input
              className={inputCls + ' w-20'}
              value={m.durationLabel}
              placeholder="2h 00"
              onChange={(e) => setMod(i, { ...m, durationLabel: e.target.value })}
            />
            <IconBtn title="Supprimer le module" onClick={() => onChange(modules.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
          <div className="space-y-2 pl-2">
            {m.submodules.map((sub, si) => {
              const setSub = (next: typeof sub) =>
                setMod(i, { ...m, submodules: m.submodules.map((s, k) => (k === si ? next : s)) });
              return (
                <div key={si} className="rounded-md border border-zinc-200 bg-white p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <input
                      className={inputCls + ' w-20'}
                      value={sub.code}
                      placeholder="M1.1"
                      onChange={(e) => setSub({ ...sub, code: e.target.value })}
                    />
                    <input
                      className={inputCls}
                      value={sub.title}
                      placeholder="Titre du sous-module"
                      onChange={(e) => setSub({ ...sub, title: e.target.value })}
                    />
                    <IconBtn
                      title="Supprimer le sous-module"
                      onClick={() => setMod(i, { ...m, submodules: m.submodules.filter((_, k) => k !== si) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Contenu (1 ligne = 1 puce)">
                      <Lines value={sub.contenu} onChange={(v) => setSub({ ...sub, contenu: v })} />
                    </Field>
                    <Field label="Objectifs pédagogiques">
                      <Lines value={sub.objectifs} onChange={(v) => setSub({ ...sub, objectifs: v })} />
                    </Field>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                setMod(i, { ...m, submodules: [...m.submodules, { code: '', title: '', durationLabel: '', contenu: [], objectifs: [] }] })
              }
              className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-700"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter un sous-module
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...modules, { code: `MODULE ${modules.length + 1}`, title: '', durationLabel: '', submodules: [] }])}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-violet-700"
      >
        <Plus className="h-4 w-4" /> Ajouter un module
      </button>
    </div>
  );
}

function SectionEditor({ section, onChange }: { section: ProgrammeSection; onChange: (s: ProgrammeSection) => void }) {
  if (section.type === 'richtext')
    return <RichTextEditor value={section.html} onChange={(html) => onChange({ ...section, html })} showVariablesPanel={false} />;
  if (section.type === 'keyvalue')
    return <KeyValueEditor rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} />;
  if (section.type === 'bullets')
    return (
      <Field label="Une ligne = une puce">
        <Lines value={section.items} rows={5} onChange={(items) => onChange({ ...section, items })} />
      </Field>
    );
  if (section.type === 'schedule')
    return <ScheduleEditor rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} />;
  // modules
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Libellé durée totale">
          <Text value={section.totalLabel} onChange={(totalLabel) => onChange({ ...section, totalLabel })} />
        </Field>
        <Field label="Valeur durée totale">
          <Text value={section.totalValue} onChange={(totalValue) => onChange({ ...section, totalValue })} />
        </Field>
      </div>
      <Field label="Cartes « vue d’ensemble » (1 ligne = MODULE | Titre | Durée)">
        <Lines
          rows={3}
          value={section.overview.map((o) => `${o.code} | ${o.title} | ${o.durationLabel}`)}
          onChange={(lines) =>
            onChange({
              ...section,
              overview: lines
                .filter((l) => l.trim() !== '')
                .map((l) => {
                  const [code = '', title = '', durationLabel = ''] = l.split('|').map((x) => x.trim());
                  return { code, title, durationLabel };
                }),
            })
          }
        />
      </Field>
      <ModulesEditor modules={section.modules} onChange={(modules) => onChange({ ...section, modules })} />
    </div>
  );
}

function newSection(type: ProgrammeSectionType): ProgrammeSection {
  const id = `${type}-${Date.now()}`;
  if (type === 'richtext') return { id, type, title: 'Nouvelle section', html: '' };
  if (type === 'keyvalue') return { id, type, title: 'Nouveau tableau', rows: [] };
  if (type === 'bullets') return { id, type, title: 'Nouvelle liste', items: [] };
  if (type === 'schedule') return { id, type, title: 'Déroulé', columns: ['Horaire', 'Contenu', 'Durée'], rows: [] };
  return { id, type: 'modules', title: 'Programme', overviewTitle: 'Vue d’ensemble', overview: [], totalLabel: 'Durée totale', totalValue: '', modules: [] };
}

const SECTION_TYPE_LABEL: Record<ProgrammeSectionType, string> = {
  richtext: 'Texte riche (tableaux OK)',
  keyvalue: 'Tableau label / valeur',
  bullets: 'Liste à puces',
  modules: 'Modules',
  schedule: 'Déroulé horaire',
};

// ── Éditeur principal ──────────────────────────────────────────────────────
export function ProgrammeEditor({
  formationId,
  initial,
  publicHref,
}: {
  formationId: string;
  initial: Programme;
  publicHref: string | null;
}) {
  const [draft, setDraft] = useState<Programme>(initial);
  const [msg, setMsg] = useState<string>('');
  const [isPending, start] = useTransition();

  const setTheme = (patch: Partial<Programme['theme']>) => setDraft((d) => ({ ...d, theme: { ...d.theme, ...patch } }));
  const setHeader = (patch: Partial<Programme['header']>) => setDraft((d) => ({ ...d, header: { ...d.header, ...patch } }));
  const setFooter = (patch: Partial<Programme['footer']>) => setDraft((d) => ({ ...d, footer: { ...d.footer, ...patch } }));
  const setSection = (i: number, next: ProgrammeSection) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s, j) => (j === i ? next : s)) }));
  const moveSection = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const arr = [...d.sections];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      return { ...d, sections: arr };
    });
  const removeSection = (i: number) => setDraft((d) => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }));
  const addSection = (type: ProgrammeSectionType) => setDraft((d) => ({ ...d, sections: [...d.sections, newSection(type)] }));

  const save = () =>
    start(async () => {
      const r = await saveProgramme(formationId, draft);
      setMsg(r.ok ? '✓ Enregistré' : `Erreur : ${r.error}`);
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
      {/* Panneau de contrôle */}
      <div className="space-y-3">
        <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-zinc-50/95 px-1 py-2 backdrop-blur">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {publicHref && (
            <a
              href={publicHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-white"
            >
              <ExternalLink className="h-4 w-4" /> Page publique
            </a>
          )}
          {msg && <span className="text-[12px] text-zinc-500">{msg}</span>}
        </div>

        <Collapse title="🎨 Thème (couleurs, police)">
          <div className="grid grid-cols-2 gap-2">
            {COLOR_FIELDS.map((c) => (
              <Field key={c.key} label={c.label}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-10 rounded border border-zinc-200"
                    value={String(draft.theme[c.key])}
                    onChange={(e) => setTheme({ [c.key]: e.target.value } as Partial<Programme['theme']>)}
                  />
                  <input
                    className={inputCls}
                    value={String(draft.theme[c.key])}
                    onChange={(e) => setTheme({ [c.key]: e.target.value } as Partial<Programme['theme']>)}
                  />
                </div>
              </Field>
            ))}
          </div>
          <Field label="Police">
            <select className={inputCls} value={draft.theme.fontFamily} onChange={(e) => setTheme({ fontFamily: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] text-zinc-700">
              <input
                type="checkbox"
                checked={draft.theme.uppercaseHeadings}
                onChange={(e) => setTheme({ uppercaseHeadings: e.target.checked })}
              />
              Titres en MAJUSCULES
            </label>
            <Field label="Coins (px)">
              <input
                type="number"
                min={0}
                max={40}
                className={inputCls + ' w-20'}
                value={draft.theme.cornerRadius}
                onChange={(e) => setTheme({ cornerRadius: Number(e.target.value) })}
              />
            </Field>
          </div>
        </Collapse>

        <Collapse title="🏷️ En-tête" defaultOpen>
          <Field label="Logo (URL ou data-URI)">
            <Text value={draft.header.logoUrl} onChange={(logoUrl) => setHeader({ logoUrl })} placeholder="https://… ou data:image/png;base64,…" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nom organisme">
              <Text value={draft.header.orgName} onChange={(orgName) => setHeader({ orgName })} />
            </Field>
            <Field label="Sur-titre">
              <Text value={draft.header.kicker} onChange={(kicker) => setHeader({ kicker })} />
            </Field>
          </div>
          <Field label="Titre de la formation">
            <Text value={draft.header.title} onChange={(title) => setHeader({ title })} />
          </Field>
          <Field label="Sous-titre">
            <Text value={draft.header.subtitle} onChange={(subtitle) => setHeader({ subtitle })} />
          </Field>
          <Field label="Badges (1 ligne = Icône | Texte)">
            <Lines
              rows={3}
              value={draft.header.metaItems.map((m) => `${m.icon} | ${m.text}`)}
              onChange={(lines) =>
                setHeader({
                  metaItems: lines
                    .filter((l) => l.trim() !== '')
                    .map((l) => {
                      const [icon = 'clock', text = ''] = l.split('|').map((x) => x.trim());
                      const valid = META_ICONS.some((m) => m.value === icon) ? (icon as MetaIcon) : 'clock';
                      return { icon: valid, text };
                    }),
                })
              }
            />
            <span className="mt-1 block text-[11px] text-zinc-400">
              Icônes : {META_ICONS.map((m) => m.value).join(', ')}
            </span>
          </Field>
        </Collapse>

        {draft.sections.map((s, i) => (
          <Collapse key={s.id} title={`§ ${s.title || SECTION_TYPE_LABEL[s.type]}`}>
            <div className="mb-2 flex items-center gap-2">
              <input
                className={inputCls + ' font-medium'}
                value={s.title}
                placeholder="Titre de la section"
                onChange={(e) => setSection(i, { ...s, title: e.target.value })}
              />
              <IconBtn title="Monter" onClick={() => moveSection(i, -1)}>
                <ChevronUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn title="Descendre" onClick={() => moveSection(i, 1)}>
                <ChevronDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn title="Supprimer la section" onClick={() => removeSection(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
            <SectionEditor section={s} onChange={(next) => setSection(i, next)} />
          </Collapse>
        ))}

        <Collapse title="➕ Ajouter une section">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SECTION_TYPE_LABEL) as ProgrammeSectionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addSection(t)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:border-violet-300"
              >
                + {SECTION_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Collapse>

        <Collapse title="📄 Pied de page">
          <Field label="Ligne légale (en gras)">
            <Text value={draft.footer.legalLine} onChange={(legalLine) => setFooter({ legalLine })} />
          </Field>
          <Field label="Lignes (1 par ligne)">
            <Lines value={draft.footer.lines} onChange={(lines) => setFooter({ lines })} />
          </Field>
          <Field label="Mention de version">
            <Text value={draft.footer.versionLine} onChange={(versionLine) => setFooter({ versionLine })} />
          </Field>
        </Collapse>
      </div>

      {/* Aperçu live */}
      <div>
        <div className="mb-2 flex items-center justify-between print:hidden">
          <span className="text-[12px] font-medium uppercase tracking-wide text-zinc-400">Aperçu en direct</span>
          <PrintProgrammeButton />
        </div>
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
          <ProgrammeDocument programme={draft} />
        </div>
      </div>
    </div>
  );
}
