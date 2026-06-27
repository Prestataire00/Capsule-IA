// ARCHETYPE: command
// Justification: module Qualiopi critère 6 — veille (registre) + plan d'amélioration
// continue (actions), alimenté par les réclamations.
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Telescope,
  ClipboardCheck,
  MessageSquareWarning,
  Plus,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createVeilleEntry, createImprovementAction, updateImprovementStatus } from './actions';

export const dynamic = 'force-dynamic';

const VEILLE_CAT_LABELS: Record<string, string> = {
  legale: 'Légale & réglementaire',
  metier: 'Métier & secteur',
  pedagogique: 'Pédagogique',
  technologique: 'Technologique',
  handicap: 'Handicap',
  autre: 'Autre',
};
const ORIGIN_LABELS: Record<string, string> = {
  reclamation: 'Réclamation',
  satisfaction: 'Satisfaction',
  audit: 'Audit',
  veille: 'Veille',
  autre: 'Autre',
};
const ACTION_STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  open: { label: 'à faire', tone: 'neutral' },
  in_progress: { label: 'en cours', tone: 'warning' },
  done: { label: 'terminée', tone: 'success' },
};

type VeilleRow = {
  id: string;
  category: string;
  title: string;
  summary: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
};
type ActionRow = {
  id: string;
  origin: string;
  complaint_id: string | null;
  title: string;
  owner: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  created_at: string;
};
type ComplaintRow = {
  id: string;
  reference: string;
  subject: string;
  severity: string;
  created_at: string;
};

async function load() {
  const sb = supabaseServer();
  const [{ data: veille }, { data: actions }, { data: complaints }] = await Promise.all([
    sb
      .schema('app')
      .from('veille_entries')
      .select('id, category, title, summary, source_url, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    sb
      .schema('app')
      .from('improvement_actions')
      .select('id, origin, complaint_id, title, owner, priority, status, due_date, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    sb
      .schema('app')
      .from('complaints')
      .select('id, reference, subject, severity, created_at')
      .is('resolved_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  return {
    veille: (veille ?? []) as unknown as VeilleRow[],
    actions: (actions ?? []) as unknown as ActionRow[],
    complaints: (complaints ?? []) as unknown as ComplaintRow[],
  };
}

export default async function AmeliorationContinuePage() {
  const { veille, actions, complaints } = await load();

  // Réclamations sans action d'amélioration déjà créée.
  const linkedComplaintIds = new Set(actions.map((a) => a.complaint_id).filter(Boolean));
  const complaintsToTreat = complaints.filter((c) => !linkedComplaintIds.has(c.id));

  const openActions = actions.filter((a) => a.status !== 'done').length;
  const veilleToTreat = veille.filter((v) => v.status !== 'traitee').length;

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-8 space-y-8">
      <header>
        <SectionLabel className="mb-1">Qualité · Critère 6</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Veille & amélioration continue
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Veille (légale, métier, pédagogique…) et plan d&apos;actions d&apos;amélioration, alimenté par
          les réclamations et la satisfaction.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Veille à traiter" value={veilleToTreat} icon={Telescope} accent="violet" />
        <StatCard label="Actions ouvertes" value={openActions} icon={ClipboardCheck} accent="amber" />
        <StatCard
          label="Réclamations ouvertes"
          value={complaints.length}
          icon={MessageSquareWarning}
          accent="rose"
          href="/reclamations"
        />
        <StatCard label="Entrées de veille" value={veille.length} icon={Telescope} accent="blue" />
      </div>

      {/* Réclamations à transformer en actions */}
      <section className="space-y-3">
        <SectionLabel>Réclamations à traiter</SectionLabel>
        {complaintsToTreat.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucune réclamation ouverte sans action d&apos;amélioration. 👌
          </p>
        ) : (
          <ul className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
            {complaintsToTreat.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <MessageSquareWarning className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <a href={`/reclamations/${c.id}`} className="font-mono text-[11px] text-zinc-500 hover:underline">
                  {c.reference}
                </a>
                <span className="flex-1 text-zinc-800 dark:text-zinc-200 truncate">{c.subject}</span>
                <form action={createImprovementAction}>
                  <input type="hidden" name="origin" value="reclamation" />
                  <input type="hidden" name="complaint_id" value={c.id} />
                  <input type="hidden" name="title" value={`Traiter la réclamation ${c.reference} — ${c.subject}`} />
                  <input type="hidden" name="priority" value={c.severity === 'critical' || c.severity === 'high' ? 'high' : 'medium'} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium"
                  >
                    Créer une action <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Plan d'amélioration continue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Plan d&apos;amélioration continue</SectionLabel>
          <NewActionForm />
        </div>
        {actions.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune action pour le moment.</p>
        ) : (
          <ul className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
            {actions.map((a) => {
              const st = ACTION_STATUS[a.status] ?? ACTION_STATUS.open!;
              return (
                <li key={a.id} className="grid grid-cols-[1fr_120px_120px_140px] gap-3 px-4 py-3 items-center text-[13px]">
                  <span className="min-w-0">
                    <span className="text-zinc-900 dark:text-zinc-100">{a.title}</span>
                    <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                      {ORIGIN_LABELS[a.origin] ?? a.origin}
                      {a.complaint_id && (
                        <>
                          {' · '}
                          <a href={`/reclamations/${a.complaint_id}`} className="hover:underline">réclamation</a>
                        </>
                      )}
                      {a.owner ? ` · ${a.owner}` : ''}
                      {a.due_date ? ` · échéance ${format(parseISO(a.due_date), 'dd/MM/yy')}` : ''}
                    </span>
                  </span>
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  <span className="text-[11px] text-zinc-400">
                    {format(parseISO(a.created_at), 'dd MMM yyyy', { locale: fr })}
                  </span>
                  <span className="flex items-center gap-1.5 justify-end">
                    {a.status !== 'in_progress' && a.status !== 'done' && (
                      <StatusButton id={a.id} status="in_progress" label="Démarrer" />
                    )}
                    {a.status !== 'done' && <StatusButton id={a.id} status="done" label="Terminer" done />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Registre de veille */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Registre de veille</SectionLabel>
          <NewVeilleForm />
        </div>
        {veille.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune entrée de veille.</p>
        ) : (
          <ul className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
            {veille.map((v) => (
              <li key={v.id} className="px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold">
                    {VEILLE_CAT_LABELS[v.category] ?? v.category}
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">{v.title}</span>
                  <span className="text-[11px] text-zinc-400">
                    {format(parseISO(v.created_at), 'dd MMM yyyy', { locale: fr })}
                  </span>
                </div>
                {v.summary && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">{v.summary}</p>}
                {v.source_url && (
                  <a href={v.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-violet-600 hover:underline">
                    Source
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  done,
}: {
  id: string;
  status: string;
  label: string;
  done?: boolean;
}) {
  return (
    <form action={updateImprovementStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition ${
          done
            ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      >
        {done && <CheckCircle2 className="w-3 h-3" />}
        {label}
      </button>
    </form>
  );
}

function NewActionForm() {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> Nouvelle action
      </summary>
      <form
        action={createImprovementAction}
        className="absolute right-0 z-10 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-lg p-4 space-y-3"
      >
        <FormField label="Titre" required>
          <input type="text" name="title" required className={inputClass} placeholder="Action à mener" />
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Origine">
            <select name="origin" defaultValue="autre" className={inputClass}>
              <option value="satisfaction">Satisfaction</option>
              <option value="audit">Audit</option>
              <option value="veille">Veille</option>
              <option value="autre">Autre</option>
            </select>
          </FormField>
          <FormField label="Priorité">
            <select name="priority" defaultValue="medium" className={inputClass}>
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Responsable">
            <input type="text" name="owner" className={inputClass} placeholder="Nom" />
          </FormField>
          <FormField label="Échéance">
            <input type="date" name="due_date" className={inputClass} />
          </FormField>
        </div>
        <FormField label="Description">
          <textarea name="description" rows={2} className={inputClass} />
        </FormField>
        <button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-3 py-2 rounded-lg">
          Ajouter l&apos;action
        </button>
      </form>
    </details>
  );
}

function NewVeilleForm() {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> Nouvelle entrée
      </summary>
      <form
        action={createVeilleEntry}
        className="absolute right-0 z-10 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-lg p-4 space-y-3"
      >
        <FormField label="Catégorie" required>
          <select name="category" defaultValue="legale" className={inputClass}>
            <option value="legale">Légale & réglementaire</option>
            <option value="metier">Métier & secteur</option>
            <option value="pedagogique">Pédagogique</option>
            <option value="technologique">Technologique</option>
            <option value="handicap">Handicap</option>
            <option value="autre">Autre</option>
          </select>
        </FormField>
        <FormField label="Titre" required>
          <input type="text" name="title" required className={inputClass} placeholder="Sujet de veille" />
        </FormField>
        <FormField label="Résumé">
          <textarea name="summary" rows={2} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-1 gap-2">
          <FormField label="Source (URL)">
            <input type="url" name="source_url" className={inputClass} placeholder="https://…" />
          </FormField>
          <FormField label="Impact">
            <input type="text" name="impact" className={inputClass} placeholder="Conséquence / action" />
          </FormField>
        </div>
        <button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-3 py-2 rounded-lg">
          Ajouter l&apos;entrée
        </button>
      </form>
    </details>
  );
}
