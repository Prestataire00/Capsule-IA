// ARCHETYPE: workflow
// Justification: planifier une session — depuis une formation du catalogue, ou
// librement pour un client (sans formation ni dossier).

import Link from 'next/link';
import { ArrowLeft, Plus, GraduationCap } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { SectionLabel } from '@/shared/ui/section-label';
import { NewSessionPicker } from './new-session.client';
import { FreeSessionForm, type Option } from './free-session-form.client';

export const dynamic = 'force-dynamic';

type SearchParams = { mode?: string };

const MODES = [
  { key: 'formation', label: 'Depuis une formation' },
  { key: 'libre', label: 'Séance libre (client)' },
] as const;

export default async function NouvelleSessionPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAccess('catalogue', 'manage');
  const mode = searchParams?.mode === 'libre' ? 'libre' : 'formation';

  const sb = supabaseServer();
  const [{ data: formationData }, { data: companyData }, { data: learnerData }, { data: trainerData }] =
    await Promise.all([
      sb.schema('app').from('formations').select('id, title').is('deleted_at', null).order('title', { ascending: true }),
      sb.schema('app').from('companies').select('id, name').is('deleted_at', null).order('name', { ascending: true }),
      sb
        .schema('app')
        .from('learners')
        .select('id, first_name, last_name, email')
        .is('deleted_at', null)
        .order('last_name', { ascending: true }),
      sb
        .schema('app')
        .from('trainers')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .order('last_name', { ascending: true }),
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formations = ((formationData as any[]) ?? []) as { id: string; title: string }[];
  const companies: Option[] = (((companyData as { id: string; name: string }[] | null) ?? [])).map((c) => ({
    id: c.id,
    label: c.name,
  }));
  const learners: Option[] = (
    ((learnerData as { id: string; first_name: string; last_name: string; email: string | null }[] | null) ?? [])
  ).map((l) => ({
    id: l.id,
    label: `${l.first_name} ${l.last_name}${l.email ? ` · ${l.email}` : ''}`.trim(),
  }));
  const trainers: Option[] = (
    ((trainerData as { id: string; first_name: string | null; last_name: string | null }[] | null) ?? [])
  ).map((t) => ({ id: t.id, label: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Formateur' }));

  return (
    <div className="max-w-2xl w-full mx-auto px-8 py-9">
      <Link
        href="/sessions"
        className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux sessions
      </Link>

      <header className="mb-6">
        <SectionLabel className="mb-2">Planification</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
          Planifier une session
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          {mode === 'libre'
            ? 'Une intervention pour un client, sans passer par le catalogue : intitulé libre, participants inscrits directement.'
            : 'Une session de groupe rattachée à une formation du catalogue — les dossiers de la formation y sont rattachés automatiquement.'}
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-1.5 mb-5" aria-label="Type de session">
        {MODES.map((m) => {
          const actif = m.key === mode;
          return (
            <Link
              key={m.key}
              href={m.key === 'formation' ? '/sessions/nouvelle' : '/sessions/nouvelle?mode=libre'}
              className={`text-[13px] font-semibold px-3 h-9 inline-flex items-center rounded-lg border transition ${
                actif
                  ? 'border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800/60'
              }`}
            >
              {m.label}
            </Link>
          );
        })}
      </nav>

      {mode === 'libre' ? (
        <FreeSessionForm companies={companies} learners={learners} trainers={trainers} />
      ) : formations.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-10 text-center">
          <span className={`w-12 h-12 rounded-xl grid place-items-center mx-auto mb-3 ${ACCENTS.blue.soft}`}>
            <GraduationCap className="w-6 h-6" />
          </span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
            Aucune formation au catalogue. Créez une formation, ou planifiez une{' '}
            <Link href="/sessions/nouvelle?mode=libre" className="text-orange-600 dark:text-orange-400 hover:underline">
              séance libre pour un client
            </Link>
            .
          </p>
          <Link
            href="/formations/nouvelle"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Nouvelle formation
          </Link>
        </div>
      ) : (
        <NewSessionPicker formations={formations} />
      )}
    </div>
  );
}
