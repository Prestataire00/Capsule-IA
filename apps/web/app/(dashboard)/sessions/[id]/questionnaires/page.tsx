// ARCHETYPE: command
// Justification: les questionnaires de la séance — on coche ceux qui doivent partir, chacun à son moment.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Library, Plus, QrCode } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { loadSession } from '@/features/sessions/load-session';
import {
  INTERLOCUTEURS,
  ETAPES,
  etapeDuModele,
  interlocuteurDuModele,
} from '@/features/questionnaire/cartographie';
import {
  cleMoment,
  jourEnvoi,
  momentParDefaut,
} from '@/features/questionnaire/programmation-seance';
import { programmationsDeLaSeance } from '@/features/questionnaire/questionnaires-de-seance';
import { QuestionnairesSeance, type LigneQuestionnaire } from './questionnaires-seance.client';

export const dynamic = 'force-dynamic';

type Modele = {
  id: string;
  title: string;
  kind: string;
  code: string | null;
  audience?: string | null;
  organization_id: string | null;
};

export default async function SessionQuestionnairesTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session, dossierIds } = loaded;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;

  const [{ data: tData }, programmations, gerer, { data: aData }] = await Promise.all([
    db
      .schema('app')
      .from('questionnaire_templates')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('title', { ascending: true }),
    programmationsDeLaSeance(db, params.id),
    canManageSection('dossiers'),
    dossierIds.length
      ? db
          .schema('app')
          .from('questionnaire_assignments')
          .select('template_id, status')
          .in('dossier_id', dossierIds)
          .neq('status', 'expired')
      : Promise.resolve({ data: [] }),
  ]);

  const suivi = new Map<string, { total: number; repondu: number }>();
  for (const a of (aData ?? []) as Array<{ template_id: string; status: string }>) {
    const s = suivi.get(a.template_id) ?? { total: 0, repondu: 0 };
    s.total++;
    if (a.status === 'completed') s.repondu++;
    suivi.set(a.template_id, s);
  }

  const ordreInterlocuteur = new Map<string, number>(INTERLOCUTEURS.map((i, n) => [i.cle, n]));
  const ordreEtape = new Map<string, number>(ETAPES.map((e, n) => [e.cle, n]));
  const seance = { startsAt: session.starts_at, endsAt: session.ends_at };

  const lignes: LigneQuestionnaire[] = ((tData ?? []) as Modele[])
    .map((m) => {
      const p = programmations.get(m.id);
      const moment = p ? { ancre: p.ancre, decalage: p.decalage_jours } : momentParDefaut(m);
      return {
        templateId: m.id,
        titre: m.title,
        interlocuteur: interlocuteurDuModele(m),
        etape: etapeDuModele(m),
        coche: p?.enabled ?? false,
        moment: cleMoment(moment),
        jourEnvoi: jourEnvoi(seance, moment),
        envoyeLe: p?.sent_at ?? null,
        bilan: p?.bilan ?? null,
        suivi: suivi.get(m.id) ?? null,
      };
    })
    .sort(
      (a, b) =>
        (ordreInterlocuteur.get(a.interlocuteur) ?? 9) -
          (ordreInterlocuteur.get(b.interlocuteur) ?? 9) ||
        (ordreEtape.get(a.etape) ?? 9) - (ordreEtape.get(b.etape) ?? 9) ||
        a.titre.localeCompare(b.titre, 'fr'),
    );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
          Cochez les questionnaires à envoyer pour cette séance et choisissez quand. Ils partent
          tout seuls le jour dit, par e-mail — le stagiaire répond dans son espace, l’entreprise, le
          financeur et le formateur par un lien.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/projection/satisfaction/${params.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="QR code à projeter en fin de séance : chaque stagiaire répond sur son téléphone"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <QrCode className="w-3.5 h-3.5" /> Projeter la satisfaction
          </a>
          <Link
            href="/questionnaires"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Library className="w-3.5 h-3.5" /> Bibliothèque
          </Link>
          <Link
            href="/questionnaires/nouveau"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" /> Créer un questionnaire
          </Link>
        </div>
      </div>
      <QuestionnairesSeance sessionId={params.id} lignes={lignes} gerer={gerer} />
    </div>
  );
}
