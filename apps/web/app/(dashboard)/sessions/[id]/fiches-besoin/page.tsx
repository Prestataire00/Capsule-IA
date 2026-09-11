// ARCHETYPE: command
// Justification: analyse des besoins de chaque participant de la session (questionnaire de positionnement).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ClipboardList } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { EmptyState } from '@/shared/ui/empty-state';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';

export const dynamic = 'force-dynamic';

const NIVEAUX: Record<number, string> = { 1: 'Débutant', 2: 'Bases', 3: 'Intermédiaire', 4: 'Avancé', 5: 'Expert' };

type Reponses = {
  currentLevel?: number | null;
  objectives?: string | null;
  expectations?: string | null;
  constraints?: string | null;
  accommodations?: string | null;
};

const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium' }).format(new Date(iso));

function Ligne({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  if (!valeur) return null;
  return (
    <div className="text-[13px]">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{valeur}</dd>
    </div>
  );
}

export default async function SessionFichesBesoin({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { learners, dossierIds } = loaded;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;

  const { data: modeles } = await db.schema('app').from('questionnaire_templates').select('id').eq('kind', 'positionnement');
  const modeleIds = ((modeles ?? []) as { id: string }[]).map((m) => m.id);
  const { data: aff } =
    modeleIds.length && dossierIds.length
      ? await db
          .schema('app')
          .from('questionnaire_assignments')
          .select('id, dossier_id, recipient_learner_id, status, created_at')
          .in('template_id', modeleIds)
          .in('dossier_id', dossierIds)
      : { data: [] };
  const affectations = (aff ?? []) as { id: string; dossier_id: string; recipient_learner_id: string | null; status: string; created_at: string }[];
  const { data: rep } = affectations.length
    ? await db.schema('app').from('questionnaire_responses').select('assignment_id, answers, submitted_at').in('assignment_id', affectations.map((a) => a.id))
    : { data: [] };
  const reponses = new Map(((rep ?? []) as { assignment_id: string; answers: Reponses | null; submitted_at: string }[]).map((r) => [r.assignment_id, r]));

  if (learners.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
        <EmptyState icon={ClipboardList} title="Aucun participant" description="Rattachez des apprenants à la session pour suivre leur analyse des besoins." />
      </div>
    );
  }

  const recues = learners.filter((l) =>
    affectations.some((a) => a.recipient_learner_id === l.id && a.dossier_id === l.dossierId && reponses.has(a.id)),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
          Analyse des besoins de chaque participant (questionnaire de positionnement) : niveau, objectifs, attentes, contraintes et
          adaptations. Elle alimente l’indicateur Qualiopi 4.
        </p>
        <span className="text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums">
          {recues} / {learners.length} fiche{learners.length > 1 ? 's' : ''} reçue{recues > 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-3">
        {learners.map((l) => {
          const a = affectations
            .filter((x) => x.recipient_learner_id === l.id && x.dossier_id === l.dossierId)
            .sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
          const r = a ? reponses.get(a.id) : undefined;
          const rp = r?.answers ?? {};
          return (
            <li key={`${l.id}-${l.dossierId}`} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <Link href={`/dossiers/${l.dossierId}`} className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 hover:underline">
                    {l.first_name} {l.last_name}
                  </Link>
                  {l.companyName && <p className="text-[12px] text-zinc-500">{l.companyName}</p>}
                </div>
                {r ? (
                  <StatusPill tone="success">Reçue le {date(r.submitted_at)}</StatusPill>
                ) : a ? (
                  <StatusPill tone="info">Envoyée, en attente</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Non envoyée</StatusPill>
                )}
              </div>
              {r ? (
                <dl className="grid sm:grid-cols-2 gap-3">
                  <Ligne label="Niveau actuel" valeur={rp.currentLevel ? NIVEAUX[rp.currentLevel] ?? String(rp.currentLevel) : null} />
                  <Ligne label="Objectifs" valeur={rp.objectives} />
                  <Ligne label="Attentes" valeur={rp.expectations} />
                  <Ligne label="Contraintes" valeur={rp.constraints} />
                  <Ligne label="Adaptations (handicap, accessibilité)" valeur={rp.accommodations} />
                </dl>
              ) : (
                <p className="text-[12px] text-zinc-500">
                  {a ? 'Le participant n’a pas encore répondu.' : 'Envoyez le questionnaire de positionnement depuis l’onglet Évaluations.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
