// ARCHETYPE: command
// Justification: tous les questionnaires, rangés par interlocuteur et par étape —
// on vient ici pour savoir ce que chacun reçoit, et quand.

import Link from 'next/link';
import { Eye, Pencil, Clock, Hand } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { QuestionnairesTabs } from '../questionnaires-tabs.client';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';
import {
  INTERLOCUTEURS,
  ETAPES,
  interlocuteurDuModele,
  etapeDuModele,
  declencheurDuModele,
} from '@/features/questionnaire/cartographie';

export const dynamic = 'force-dynamic';

type Modele = {
  id: string;
  title: string;
  kind: string;
  code: string | null;
  organization_id: string | null;
  schema: unknown;
};

export default async function CataloguePage() {
  const sb = supabaseServer();

  // Les modèles de l'organisme ET les modèles intégrés : l'écran doit montrer
  // ce qui part réellement, et beaucoup part encore du socle livré.
  const { data, error } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, kind, code, organization_id, schema')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('title', { ascending: true });
  if (error) {
    console.error('[catalogue questionnaires] lecture impossible', error.code, error.message);
    throw new Error(`Lecture impossible (catalogue des questionnaires) : ${error.message}`);
  }
  const modeles = (data ?? []) as unknown as Modele[];

  const par = new Map<string, Modele[]>();
  for (const m of modeles) {
    const cle = `${interlocuteurDuModele(m)}|${etapeDuModele(m)}`;
    par.set(cle, [...(par.get(cle) ?? []), m]);
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel className="mb-2">Documents &amp; communication</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Questionnaires</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Ce que chaque interlocuteur reçoit, et à quel moment. Ouvrez un questionnaire pour le lire en entier ou le
          modifier.
        </p>
      </div>

      <QuestionnairesTabs />

      {INTERLOCUTEURS.map((qui) => {
        const pourLui = ETAPES.map((e) => ({
          etape: e,
          modeles: par.get(`${qui.cle}|${e.cle}`) ?? [],
        })).filter((g) => g.modeles.length > 0);

        return (
          <section key={qui.cle} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                  ACCENTS[qui.accent as keyof typeof ACCENTS].soft
                }`}
              >
                {qui.label}
              </span>
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {pourLui.reduce((n, g) => n + g.modeles.length, 0)} questionnaire
                {pourLui.reduce((n, g) => n + g.modeles.length, 0) > 1 ? 's' : ''}
              </span>
            </div>

            {pourLui.length === 0 ? (
              <p className="text-[13px] text-zinc-400 dark:text-zinc-500">
                Aucun questionnaire ne lui est adressé pour l’instant.
              </p>
            ) : (
              pourLui.map(({ etape, modeles: liste }) => (
                <Groupe key={etape.cle} etape={etape} modeles={liste} />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function Groupe({
  etape,
  modeles,
}: {
  etape: (typeof ETAPES)[number];
  modeles: Modele[];
}) {
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
      <p className="px-5 h-9 flex items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800">
        {etape.label}
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {modeles.map((m) => {
          const nb = questionsDuSchema(m.schema).length;
          const declencheur = declencheurDuModele(m);
          return (
            <li key={m.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{m.title}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="tabular-nums">
                    {nb} question{nb > 1 ? 's' : ''}
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  {/* Dire d'où vient le modèle évite de chercher pourquoi on ne
                      peut pas le modifier. */}
                  <span>{m.organization_id ? 'à vous' : 'livré avec le logiciel'}</span>
                </p>
                <p className="text-[12px] mt-1 flex items-start gap-1.5">
                  {declencheur ? (
                    <>
                      <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {declencheur}{' '}
                        <Link
                          href="/emails/automatiques"
                          className="text-orange-600 dark:text-orange-400 hover:underline"
                        >
                          Régler
                        </Link>
                      </span>
                    </>
                  ) : (
                    <>
                      <Hand className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
                      <span className="text-zinc-500 dark:text-zinc-400">
                        S’envoie à la main, depuis l’onglet Questionnaires d’un dossier.
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href={`/questionnaires/${m.id}/apercu`}
                  title="Lire le questionnaire en entier"
                  className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Eye className="w-3.5 h-3.5" /> Lire
                </Link>
                <Link
                  href={`/questionnaires/${m.id}`}
                  title="Modifier le questionnaire"
                  className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Pencil className="w-3.5 h-3.5" /> Modifier
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
