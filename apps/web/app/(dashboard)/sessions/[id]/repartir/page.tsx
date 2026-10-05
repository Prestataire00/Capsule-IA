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
  // Sans dossier, les groupes appartiennent au client de la séance (0212).
  const clientId = dossierId ? null : (loaded.client?.id ?? null);
  let suite = sb
    .schema('app')
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .is('groupe_id' as never, null)
    .eq('status', 'planned')
    .gt('starts_at', session.starts_at);
  if (dossierId) suite = suite.eq('dossier_id', dossierId);
  else if (clientId) {
    suite = suite.eq('company_id' as never, clientId as never).is('dossier_id', null);
    suite = session.formation_id ? suite.eq('formation_id' as never, session.formation_id as never) : suite.is('formation_id' as never, null);
  }
  const { count: suivantes } = dossierId || clientId ? await suite : { count: 0 };

  const retour = (
    <Link href={`/sessions/${params.id}/apprenants`} className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200">
      <ArrowLeft className="w-3 h-3" /> Participants
    </Link>
  );
  if ((!dossierId && !clientId) || dejaGroupe) {
    return (
      <div className="space-y-3">
        {retour}
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          {dejaGroupe
            ? 'Cette séance est déjà celle d’un groupe.'
            : 'Indiquez d’abord le client de la séance : c’est lui qui porte ses groupes.'}
        </p>
      </div>
    );
  }

  const stagiaires = (dossierId ? loaded.learners.filter((l) => l.dossierId === dossierId) : [...loaded.learners, ...loaded.directLearners]).map((l) => ({
    id: l.id,
    nom: `${l.first_name} ${l.last_name}`.trim(),
  }));
  const lead = ((equipe ?? []) as unknown as Array<{ trainer_id: string; is_lead: boolean }>).find((t) => t.is_lead)?.trainer_id ?? null;

  return (
    <div className="space-y-4">
      {retour}
      <div>
        <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">Répartir en groupes</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
          Touchez la lettre du groupe de chaque stagiaire. Répartir cette séance : elle devient celle du premier groupe, chaque
          autre groupe a sa séance au même créneau, avec son émargement, son QR et sa visio ; les signatures déjà faites suivent
          le stagiaire. Ou créez seulement les groupes, puis rattachez chaque séance au sien.
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
        porteur={dossierId ? 'dossier' : 'client'}
      />
    </div>
  );
}
