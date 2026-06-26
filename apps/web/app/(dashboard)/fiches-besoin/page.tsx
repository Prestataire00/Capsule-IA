// ARCHETYPE: command
// Justification: vue de consultation des fiches besoin (analyse des besoins) —
// regroupées par formation, réponses détaillées, apprenants + prospects.
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClipboardList, GraduationCap, User, Building2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
import { EmptyState } from '@/shared/ui/empty-state';

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
      <p className="text-[11px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
      <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{value}</p>
    </div>
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
    <div className="space-y-6">
      <header>
        <SectionLabel className="mb-1">Qualité</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Fiches besoin
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Analyse des besoins recueillie auprès des apprenants et des inscrits, regroupée par formation.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={ClipboardList} label="Fiches besoin" value={String(fiches.length)} />
        <StatCard icon={User} label="Apprenants" value={String(learnerCount)} />
        <StatCard icon={Building2} label="Inscrits (prospects)" value={String(prospectCount)} />
      </div>

      {fiches.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune fiche besoin pour le moment"
          description="Les fiches besoin apparaîtront ici dès qu'un apprenant ou un inscrit aura répondu."
        />
      ) : (
        <div className="space-y-6">
          {orderedGroups.map(([formationTitle, list]) => (
            <section key={formationTitle}>
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                  {formationTitle}
                </h2>
                <span className="text-[11px] font-mono text-zinc-400">{list.length}</span>
              </div>

              <ul className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
                {list.map((f) => (
                  <li key={f.key}>
                    <details className="group">
                      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition list-none">
                        <span className="text-[13px] text-zinc-900 dark:text-zinc-100 flex-1">
                          {f.name}
                          <span
                            className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                              f.source === 'learner'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {f.source === 'learner' ? 'apprenant' : 'inscrit'}
                          </span>
                        </span>
                        {f.answers.currentLevel != null && (
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Niveau : {LEVEL_LABELS[f.answers.currentLevel] ?? f.answers.currentLevel}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-zinc-400">
                          {f.dateIso ? format(parseISO(f.dateIso), 'dd MMM yyyy', { locale: fr }) : '—'}
                        </span>
                      </summary>
                      <div className="px-4 pb-4 pt-1 space-y-3 bg-zinc-50/40 dark:bg-zinc-950/40">
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
