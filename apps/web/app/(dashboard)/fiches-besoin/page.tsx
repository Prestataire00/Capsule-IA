// ARCHETYPE: command
// Justification: vue de consultation des fiches besoin (analyse des besoins) —
// regroupées par formation, réponses détaillées, apprenants + prospects.
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClipboardList, GraduationCap, User, Building2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';

export const dynamic = 'force-dynamic';

const LEVEL_LABELS: Record<number, string> = {
  1: 'Débutant',
  2: 'Bases',
  3: 'Intermédiaire',
  4: 'Avancé',
  5: 'Expert',
};

type NeedsAnswers = {
  currentLevel?: number | null;
  objectives?: string | null;
  expectations?: string | null;
  constraints?: string | null;
  accommodations?: string | null;
};

type FicheItem = {
  key: string;
  source: 'learner' | 'prospect';
  name: string;
  formationTitle: string;
  dateIso: string | null;
  answers: NeedsAnswers;
};

async function loadFiches(): Promise<FicheItem[]> {
  const sb = supabaseServer();

  // 1) Fiches besoin des apprenants (réponses au questionnaire positionnement).
  const { data: templates } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id')
    .eq('kind', 'positionnement');
  const templateIds = ((templates ?? []) as { id: string }[]).map((t) => t.id);

  const items: FicheItem[] = [];

  if (templateIds.length > 0) {
    const { data: responses } = await sb
      .schema('app')
      .from('questionnaire_responses')
      .select(
        'id, answers, submitted_at, assignment:questionnaire_assignments(recipient_name, learner:learners(first_name, last_name)), dossier:dossiers(reference, formation:formations(title))',
      )
      .in('template_id', templateIds)
      .order('submitted_at', { ascending: false });

    for (const r of (responses ?? []) as unknown as Array<{
      id: string;
      answers: NeedsAnswers | null;
      submitted_at: string | null;
      assignment: {
        recipient_name: string | null;
        learner: { first_name: string; last_name: string } | null;
      } | null;
      dossier: { reference: string | null; formation: { title: string } | null } | null;
    }>) {
      const learner = r.assignment?.learner;
      const name = learner
        ? `${learner.first_name} ${learner.last_name}`.trim()
        : r.assignment?.recipient_name ?? 'Apprenant';
      items.push({
        key: `resp-${r.id}`,
        source: 'learner',
        name,
        formationTitle: r.dossier?.formation?.title ?? 'Hors formation',
        dateIso: r.submitted_at,
        answers: r.answers ?? {},
      });
    }
  }

  // 2) Fiches besoin saisies à l'inscription (prospects).
  const { data: prospects } = await sb
    .schema('app')
    .from('prospects')
    .select('id, first_name, last_name, created_at, needs_analysis, formation:formations(title)')
    .not('needs_analysis', 'is', null)
    .order('created_at', { ascending: false });

  for (const p of (prospects ?? []) as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    created_at: string | null;
    needs_analysis: NeedsAnswers | null;
    formation: { title: string } | null;
  }>) {
    items.push({
      key: `prospect-${p.id}`,
      source: 'prospect',
      name: `${p.first_name} ${p.last_name}`.trim(),
      formationTitle: p.formation?.title ?? 'Hors formation',
      dateIso: p.created_at,
      answers: p.needs_analysis ?? {},
    });
  }

  return items;
}

function Answer({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-purple-600 dark:text-purple-400 mb-0.5">{label}</p>
      <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

const AVATAR_PALETTE = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  const hash = Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${AVATAR_PALETTE[hash % AVATAR_PALETTE.length]}`}>
      {initials}
    </span>
  );
}

export default async function FichesBesoinPage() {
  const fiches = await loadFiches();

  // Regroupement par formation.
  const groups = new Map<string, FicheItem[]>();
  for (const f of fiches) {
    const arr = groups.get(f.formationTitle) ?? [];
    arr.push(f);
    groups.set(f.formationTitle, arr);
  }
  const orderedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'));

  const learnerCount = fiches.filter((f) => f.source === 'learner').length;
  const prospectCount = fiches.filter((f) => f.source === 'prospect').length;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9 space-y-6">
      <header>
        <SectionLabel className="mb-2">Qualité</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
          Fiches besoin
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
          Analyse des besoins recueillie auprès des apprenants et des inscrits, regroupée par formation.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KpiCard icon={ClipboardList} label="Fiches besoin" value={fiches.length} accent="purple" />
        <KpiCard icon={User} label="Apprenants" value={learnerCount} accent="rose" />
        <KpiCard icon={Building2} label="Inscrits (prospects)" value={prospectCount} accent="amber" />
      </div>

      {fiches.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={ClipboardList}
            title="Aucune fiche besoin pour le moment"
            description="Les fiches besoin apparaîtront ici dès qu'un apprenant ou un inscrit aura répondu."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {orderedGroups.map(([formationTitle, list]) => (
            <section key={formationTitle}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
                  <GraduationCap className="w-4 h-4" />
                </span>
                <h2 className="text-[15px] font-extrabold text-zinc-900 dark:text-zinc-100">
                  {formationTitle}
                </h2>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.purple.soft}`}>{list.length}</span>
              </div>

              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
                {list.map((f) => (
                  <li key={f.key}>
                    <details className="group">
                      <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors list-none">
                        <span className="text-[13px] flex-1 flex items-center gap-2 min-w-0">
                          <Avatar name={f.name} />
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{f.name}</span>
                          <StatusPill tone={f.source === 'learner' ? 'info' : 'warning'}>
                            {f.source === 'learner' ? 'apprenant' : 'inscrit'}
                          </StatusPill>
                        </span>
                        {f.answers.currentLevel != null && (
                          <span className="flex items-center gap-2 text-[12px] font-semibold text-blue-700 dark:text-blue-300">
                            Niveau : {LEVEL_LABELS[f.answers.currentLevel] ?? f.answers.currentLevel}
                            <AccentBar value={f.answers.currentLevel} max={5} accent="blue" className="w-14 h-1.5" />
                          </span>
                        )}
                        <span className="tabular-nums text-[12px] text-zinc-500 dark:text-zinc-400">
                          {f.dateIso ? format(parseISO(f.dateIso), 'dd MMM yyyy', { locale: fr }) : '—'}
                        </span>
                      </summary>
                      <div className="px-5 pb-4 pt-1 space-y-3 bg-zinc-50/60 dark:bg-zinc-950/40">
                        <Answer label="Objectifs" value={f.answers.objectives} />
                        <Answer label="Attentes" value={f.answers.expectations} />
                        <Answer label="Contraintes" value={f.answers.constraints} />
                        <Answer label="Besoin d'aménagement" value={f.answers.accommodations} />
                        {!f.answers.objectives &&
                          !f.answers.expectations &&
                          !f.answers.constraints &&
                          !f.answers.accommodations && (
                            <p className="text-[12px] text-zinc-400">Aucun détail renseigné.</p>
                          )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
