// ARCHETYPE: workflow
// Justification: répartir les stagiaires de la séance en groupes, le jour J,
// quand on découvre les groupes en salle.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { loadSession } from '@/features/sessions/load-session';
import { Repartir } from './repartir.client';

export const dynamic = 'force-dynamic';

export default async function RepartirPage({ params }: { params: { id: string } }) {
  if (!(await canManageSection('dossiers'))) redirect(`/sessions/${params.id}`);
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session } = loaded;

  const [{ data: extra }, { data: formateursRows }, { data: equipe }] = await Promise.all([
    sb.schema('app').from('sessions').select('groupe_id').eq('id', params.id).maybeSingle(),
    sb.schema('app').from('trainers').select('id, first_name, last_name').is('deleted_at', null).order('last_name'),
    sb.schema('app').from('session_trainers' as never).select('trainer_id, is_lead').eq('session_id', params.id).is('deleted_at', null),
  ]);
  const dejaGroupe = Boolean((extra as { groupe_id?: string | null } | null)?.groupe_id);
  const dossierId = session.dossier_id;
  const { count: suivantes } = dossierId
    ? await sb
        .schema('app')
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('dossier_id', dossierId)
        .is('groupe_id' as never, null)
        .eq('status', 'planned')
        .gt('starts_at', session.starts_at)
    : { count: 0 };

  const retour = (
    <Link href={`/sessions/${params.id}/apprenants`} className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200">
      <ArrowLeft className="w-3 h-3" /> Participants
    </Link>
  );
  if (!dossierId || dejaGroupe) {
    return (
      <div className="space-y-3">
        {retour}
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          {dejaGroupe
            ? 'Cette séance est déjà celle d’un groupe.'
            : 'Seules les séances d’un dossier se répartissent en groupes.'}
        </p>
      </div>
    );
  }

  const stagiaires = loaded.learners
    .filter((l) => l.dossierId === dossierId)
    .map((l) => ({ id: l.id, nom: `${l.first_name} ${l.last_name}`.trim() }));
  const lead = ((equipe ?? []) as unknown as Array<{ trainer_id: string; is_lead: boolean }>).find((t) => t.is_lead)?.trainer_id ?? null;

  return (
    <div className="space-y-4">
      {retour}
      <div>
        <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">Répartir en groupes</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
          Touchez la lettre du groupe de chaque stagiaire. Cette séance devient celle du premier groupe ; chaque autre groupe a
          sa séance au même créneau, avec son émargement, son QR, sa visio et sa convention. Les signatures déjà faites suivent
          le stagiaire.
        </p>
      </div>
      <Repartir
        sessionId={params.id}
        stagiaires={stagiaires}
        formateurs={((formateursRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((f) => ({
          id: f.id,
          nom: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim(),
        }))}
        formateurActuel={lead}
        seancesSuivantes={suivantes ?? 0}
      />
    </div>
  );
}
