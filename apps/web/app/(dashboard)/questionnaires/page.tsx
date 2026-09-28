// ARCHETYPE: command
// Justification: la bibliothèque des questionnaires — on les crée et les modifie
// ici, rangés par interlocuteur et par étape, puis on les coche dans chaque séance.

import Link from 'next/link';
import { Eye, Pencil, Clock, Hand, Copy, Plus } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { QuestionnairesTabs } from './questionnaires-tabs.client';
import { SeedQuestionnairesButton } from './seed-button';
import { SupprimerModele } from './supprimer-modele.client';
import { canManageSection } from '@/shared/lib/auth/require-access';
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
  audience?: string | null;
  organization_id: string | null;
  schema: unknown;
};

export default async function BibliothequeQuestionnaires() {
  const sb = supabaseServer();

  // Les modèles de l'organisme ET les modèles intégrés : l'écran doit montrer
  // ce qui part réellement, et beaucoup part encore du socle livré.
  const { data, error } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('title', { ascending: true });
  if (error) {
    console.error('[catalogue questionnaires] lecture impossible', error.code, error.message);
    throw new Error(`Lecture impossible (catalogue des questionnaires) : ${error.message}`);
  }
  const modeles = (data ?? []) as unknown as Modele[];

  // Dans combien de séances chaque questionnaire est coché : c'est ce qu'on
  // veut savoir avant de le modifier ou de le supprimer.
  const [{ data: coches }, gerer] = await Promise.all([
    sb.schema('app').from('session_questionnaires' as never).select('template_id').eq('enabled', true),
    canManageSection('crm'),
  ]);
  const seances = new Map<string, number>();
  for (const c of (coches ?? []) as unknown as Array<{ template_id: string }>) seances.set(c.template_id, (seances.get(c.template_id) ?? 0) + 1);

  const par = new Map<string, Modele[]>();
  for (const m of modeles) {
    const cle = `${interlocuteurDuModele(m)}|${etapeDuModele(m)}`;
    par.set(cle, [...(par.get(cle) ?? []), m]);
  }

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Documents &amp; communication</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Questionnaires</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
            La bibliothèque : créez et modifiez vos questionnaires ici. Pour les envoyer, ouvrez une séance, onglet{' '}
            <strong className="text-zinc-700 dark:text-zinc-300">Questionnaires</strong>, et cochez ceux que vous voulez, avec leur date d’envoi.
          </p>
        </div>
        {gerer && (
          <div className="flex items-center gap-2 flex-wrap">
            <SeedQuestionnairesButton />
            <Link
              href="/questionnaires/nouveau"
              className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nouveau questionnaire
            </Link>
          </div>
        )}
      </header>

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
                <Groupe key={etape.cle} etape={etape} modeles={liste} seances={seances} gerer={gerer} />
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
  seances,
  gerer,
}: {
  etape: (typeof ETAPES)[number];
  modeles: Modele[];
  seances: Map<string, number>;
  gerer: boolean;
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
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="tabular-nums">
                    {(seances.get(m.id) ?? 0) === 0
                      ? 'coché dans aucune séance'
                      : `coché dans ${seances.get(m.id)} séance${(seances.get(m.id) ?? 0) > 1 ? 's' : ''}`}
                  </span>
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
                        Part quand vous le cochez dans l’onglet Questionnaires d’une séance, à la date choisie.
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
                {gerer && (
                  <Link
                    href={`/questionnaires/${m.id}`}
                    title={m.organization_id ? 'Modifier le questionnaire' : 'Un modèle livré ne se modifie pas : on en fait une copie à vous'}
                    className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {m.organization_id ? <Pencil className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {m.organization_id ? 'Modifier' : 'Dupliquer'}
                  </Link>
                )}
                {gerer && m.organization_id && <SupprimerModele id={m.id} titre={m.title} seances={seances.get(m.id) ?? 0} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
