// ARCHETYPE: command
// Justification: vue d'ensemble des questionnaires assignés (positionnement, satisfaction) avec NPS agrégé.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClipboardList, ClipboardCheck, Star, Send, Plus, BarChart3, Eye, Target, Smile, GraduationCap, Landmark } from 'lucide-react';
import type { ComponentType } from 'react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard, AccentBar, ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { TemplatesSection, type TemplateItem } from './templates-section';
import { FilterDropdown } from '@/shared/components/filters/filter-dropdown.client';
import { SeedQuestionnairesButton } from './seed-button';

export const dynamic = 'force-dynamic';

const labels: Record<string, string> = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  opco: 'OPCO',
  evaluation_acquis: 'Évaluation des acquis',
  custom: 'Personnalisé',
};

const KIND_STYLE: Record<string, { icon: ComponentType<{ className?: string }>; accent: Accent }> = {
  positionnement: { icon: Target, accent: 'blue' },
  satisfaction_chaud: { icon: Smile, accent: 'amber' },
  satisfaction_froid: { icon: Smile, accent: 'sky' },
  opco: { icon: Landmark, accent: 'purple' },
  evaluation_acquis: { icon: GraduationCap, accent: 'emerald' },
};
const kindStyle = (kind: string) => KIND_STYLE[kind] ?? { icon: ClipboardList, accent: 'blue' as Accent };

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_130px_110px_70px_110px_56px] gap-4 px-5';

type AssignmentRow = {
  id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
  dossier_id: string;
  template: { title: string; kind: string } | null;
  dossier: { reference: string } | null;
  response: { nps: number | null; submitted_at: string } | null;
};

export default async function QuestionnairesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const sb = supabaseServer();

  // Assignations de questionnaires (RLS-scopé) + template, dossier et réponse éventuelle.
  const { data } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select(
      'id, recipient_name, recipient_email, status, due_at, created_at, dossier_id, ' +
        'template:questionnaire_templates(title, kind), ' +
        'dossier:dossiers(reference), ' +
        'response:questionnaire_responses(nps, submitted_at)',
    )
    .order('created_at', { ascending: false });
  const all = (data as unknown as AssignmentRow[] | null) ?? [];

  // Modèles de questionnaires (org + système).
  const { data: tplData } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, kind, schema, organization_id')
    .is('deleted_at', null)
    .order('organization_id', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true });
  const templates: TemplateItem[] = (
    (tplData as { id: string; title: string; kind: string; schema: { questions?: unknown[] } | null; organization_id: string | null }[] | null) ?? []
  ).map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind,
    questionCount: t.schema?.questions?.length ?? 0,
    isSystem: t.organization_id === null,
  }));

  const completed = all.filter((q) => q.status === 'completed').length;
  const pending = all.filter((q) => q.status === 'pending' || q.status === 'in_progress').length;
  const npsValues = all
    .map((q) => q.response?.nps)
    .filter((n): n is number => typeof n === 'number');
  const npsAvg = npsValues.length
    ? (npsValues.reduce((s, n) => s + n, 0) / npsValues.length).toFixed(1)
    : '—';

  const activeStatus =
    searchParams.status === 'completed' || searchParams.status === 'pending' ? searchParams.status : null;
  const rows =
    activeStatus === 'completed'
      ? all.filter((q) => q.status === 'completed')
      : activeStatus === 'pending'
        ? all.filter((q) => q.status === 'pending' || q.status === 'in_progress')
        : all;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Documents &amp; communication</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Questionnaires</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            Positionnement, satisfaction à chaud et à froid — preuves Qualiopi I10, I26, I27.{' '}
            <span className="tabular-nums">
              {all.length} envoi{all.length > 1 ? 's' : ''} · {templates.length} modèle{templates.length > 1 ? 's' : ''}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SeedQuestionnairesButton />
          <Link
            href="/questionnaires/analytics"
            className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 h-10 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
          >
            <BarChart3 className="w-4 h-4" /> Statistiques
          </Link>
          <Link
            href="/questionnaires/nouveau"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouveau questionnaire
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" aria-label="Synthèse">
        <KpiCard label="Questionnaires assignés" value={all.length} icon={ClipboardList} accent="blue" href="/questionnaires" />
        <KpiCard
          label="Complétés"
          value={completed}
          icon={ClipboardCheck}
          accent="emerald"
          hint={`${Math.round((completed / Math.max(all.length, 1)) * 100)}% des envois`}
          href="/questionnaires?status=completed"
        >
          <AccentBar value={completed} max={all.length} accent="emerald" />
        </KpiCard>
        <KpiCard
          label="En attente"
          value={pending}
          icon={Send}
          accent="amber"
          hint={pending > 0 ? 'à relancer si due_at proche' : '—'}
          href="/questionnaires?status=pending"
        />
        <KpiCard
          label="NPS moyen"
          value={
            <span>
              {npsAvg}
              <span className="text-[15px] opacity-60 font-semibold">/10</span>
            </span>
          }
          icon={Star}
          accent="purple"
          hint="moyenne des réponses reçues"
        />
      </section>

      {/* Modèles de questionnaires */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
              <ClipboardList className="w-4 h-4" />
            </span>
            Modèles
          </h2>
          <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.blue.soft}`}>
            {templates.length} modèle{templates.length > 1 ? 's' : ''}
          </span>
        </div>
        {templates.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun modèle.{' '}
            <Link href="/questionnaires/nouveau" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
              Créez votre premier questionnaire
            </Link>
            .
          </p>
        ) : (
          <TemplatesSection templates={templates} />
        )}
      </section>

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[17px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.rose.soft}`}>
              <Send className="w-4 h-4" />
            </span>
            Envois
          </h2>
          <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.rose.soft}`}>
            {rows.length} envoi{rows.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FilterDropdown
            label="Statut"
            paramName="status"
            options={[
              { value: 'completed', label: 'Complétés' },
              { value: 'pending', label: 'En attente' },
            ]}
            selected={activeStatus ? [activeStatus] : []}
            basePath="/questionnaires"
          />
          {activeStatus && (
            <Link
              href="/questionnaires"
              className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 h-9 inline-flex items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              Réinitialiser
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[880px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
            <div>Destinataire</div>
            <div>Type</div>
            <div>Dossier</div>
            <div>Échéance</div>
            <div>NPS</div>
            <div>Statut</div>
            <div className="text-right">Actions</div>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Aucun envoi." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((q) => {
                const kind = q.template?.kind ?? '';
                const submittedAt = q.response?.submitted_at ?? null;
                const nps = q.response?.nps ?? null;
                const ks = kindStyle(kind);
                const KindIcon = ks.icon;
                const who = q.recipient_name ?? q.recipient_email ?? '—';
                const initials = who.split(/[\s@.]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
                const palette = AVATARS[(who.charCodeAt(0) || 0) % AVATARS.length];
                return (
                  <li key={q.id}>
                    <Link
                      href={`/dossiers/${q.dossier_id}/questionnaires`}
                      className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group`}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${palette}`}>{initials || '—'}</span>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{who}</p>
                          {q.recipient_name && q.recipient_email && (
                            <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">{q.recipient_email}</p>
                          )}
                        </div>
                      </div>
                      <span className="min-w-0 flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${ACCENTS[ks.accent].soft}`}>
                          <KindIcon className="w-3.5 h-3.5" />
                        </span>
                        <span className={`font-semibold truncate ${ACCENTS[ks.accent].text}`}>{labels[kind] ?? q.template?.title ?? kind}</span>
                      </span>
                      <div>
                        <IdPill>{q.dossier?.reference ?? '—'}</IdPill>
                      </div>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {submittedAt
                          ? `répondu ${format(parseISO(submittedAt), 'dd/MM', { locale: fr })}`
                          : q.due_at
                            ? `due ${format(parseISO(q.due_at), 'dd/MM', { locale: fr })}`
                            : '—'}
                      </span>
                      <span className={`tabular-nums font-bold ${nps == null ? '' : nps >= 9 ? ACCENTS.emerald.text : nps >= 7 ? ACCENTS.amber.text : ACCENTS.rose.text}`}>
                        {nps != null ? (
                          <>
                            {nps}
                            <span className="text-zinc-400 font-semibold">/10</span>
                          </>
                        ) : (
                          <span className="text-zinc-400 font-normal">—</span>
                        )}
                      </span>
                      <div>
                        <StatusPill tone={q.status === 'completed' ? 'success' : q.status === 'expired' ? 'danger' : q.status === 'in_progress' ? 'warning' : 'info'}>
                          {q.status === 'completed' ? 'rempli' : q.status === 'expired' ? 'expiré' : q.status === 'in_progress' ? 'en cours' : 'envoyé'}
                        </StatusPill>
                      </div>
                      <div className="flex justify-end">
                        <span
                          aria-hidden
                          className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 group-hover:bg-orange-50 group-hover:text-orange-600 dark:group-hover:bg-orange-950/40 dark:group-hover:text-orange-300 transition"
                        >
                          <Eye className="w-4 h-4" />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
