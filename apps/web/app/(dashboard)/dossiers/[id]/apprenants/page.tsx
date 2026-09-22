// ARCHETYPE: command
// Justification: les stagiaires d'un dossier — les voir, et les inscrire quand la
// liste nominative arrive après la convention.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users, Mail, Phone, Info, Crown } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { SectionLabel } from '@/shared/ui/section-label';
import { estTitulaireProvisoire } from '@/features/dossier/referent';
import { AjoutApprenants } from './ajout-apprenants.client';
import { RetirerBouton } from './retirer-bouton.client';

export const dynamic = 'force-dynamic';

type Apprenant = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

export default async function DossierApprenantsPage({ params }: { params: { id: string } }) {
  // Lecture sous RLS : un dossier d'une autre organisation n'existe pas ici.
  const sb = supabaseServer();
  const { data: dossierRow, error: erreurLecture } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, learner_id, company_id')
    .eq('id', params.id)
    .maybeSingle();
  const dossier = dossierRow as { learner_id: string | null; company_id: string | null } | null;
  // Une requête en échec n'est pas un dossier absent : sans cette distinction,
  // toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[apprenants du dossier] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (apprenants du dossier) : ${erreurLecture.message}`);
  }
  if (!dossier) notFound();

  const admin = supabaseAdmin();

  // Les séances du dossier par ses deux chemins, puis leurs participants.
  const [liens, directes] = await Promise.all([
    admin.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', params.id),
    admin.schema('app').from('sessions').select('id').eq('dossier_id', params.id).neq('status', 'cancelled'),
  ]);
  const sessionIds = [
    ...new Set([
      ...(((liens.data ?? []) as Array<{ session_id: string }>).map((l) => l.session_id)),
      ...(((directes.data ?? []) as Array<{ id: string }>).map((s) => s.id)),
    ]),
  ];

  const { data: participants } = sessionIds.length
    ? await admin
        .schema('app')
        .from('session_participants')
        .select('learner_id')
        .in('session_id', sessionIds)
        .eq('participant_kind', 'learner')
    : { data: [] };

  // Le groupe du dossier (0175) : c'est lui qui fait foi, même sans séance.
  const { data: duGroupe } = await admin
    .schema('app')
    .from('dossier_learners' as never)
    .select('learner_id')
    .eq('dossier_id', params.id);

  const ids = new Set<string>();
  if (dossier.learner_id) ids.add(dossier.learner_id);
  for (const l of ((duGroupe ?? []) as unknown as Array<{ learner_id: string }>)) ids.add(l.learner_id);
  for (const p of ((participants ?? []) as Array<{ learner_id: string | null }>)) {
    if (p.learner_id) ids.add(p.learner_id);
  }

  const { data: rows } = ids.size
    ? await admin
        .schema('app')
        .from('learners')
        .select('id, first_name, last_name, email, phone')
        .in('id', [...ids])
        .is('deleted_at', null)
        .order('last_name', { ascending: true })
    : { data: [] };

  const tous = (rows ?? []) as Apprenant[];
  // Le titulaire provisoire de l'import ne désigne personne : il n'a pas sa
  // place dans une liste de stagiaires.
  const apprenants = tous.filter((l) => !estTitulaireProvisoire(l.email));
  const enAttenteDeListe = tous.some((l) => estTitulaireProvisoire(l.email));
  const peutModifier = await canManageSection('dossiers');

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Stagiaires</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          {apprenants.length === 0
            ? 'Aucun stagiaire inscrit sur ce dossier.'
            : sessionIds.length === 0
              ? `${apprenants.length} stagiaire${apprenants.length > 1 ? 's' : ''} inscrit${apprenants.length > 1 ? 's' : ''}. Aucune séance planifiée : ils y seront rattachés dès qu'une date sera posée.`
              : `${apprenants.length} stagiaire${apprenants.length > 1 ? 's' : ''} inscrit${apprenants.length > 1 ? 's' : ''}, sur ${sessionIds.length} séance${sessionIds.length > 1 ? 's' : ''}.`}
        </p>
      </div>

      {enAttenteDeListe && (
        <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-4 py-3 text-[13px] text-zinc-700 dark:text-zinc-300 inline-flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-zinc-400" />
          <span>
            Ce dossier est au nom du <strong>référent désigné chez le client</strong> ; les personnes inscrites
            ci-dessous en sont les <strong>stagiaires</strong>. Le titulaire technique que la base exige reste masqué et
            n’apparaît sur aucun document.
          </span>
        </p>
      )}

      {peutModifier && <AjoutApprenants dossierId={params.id} />}

      {apprenants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <Users className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">
            Sans stagiaire nommé, ni convocation ni feuille d&apos;émargement ne peuvent partir.
          </p>
        </div>
      ) : (
        <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
          {apprenants.map((l) => {
            const nom = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Stagiaire';
            const titulaire = l.id === dossier.learner_id;
            return (
              <li key={l.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                    {`${l.first_name?.[0] ?? ''}${l.last_name?.[0] ?? ''}`.toUpperCase() || '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      <Link href={`/apprenants/${l.id}`} className="hover:underline">
                        {nom}
                      </Link>
                      {titulaire && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                          <Crown className="w-3 h-3" /> Titulaire
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                      {l.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          <a href={`mailto:${l.email}`} className="hover:underline">
                            {l.email}
                          </a>
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          Sans e-mail : ni convocation ni lien d&apos;émargement ne partiront.
                        </span>
                      )}
                      {l.phone && (
                        <span className="inline-flex items-center gap-1.5 ml-3 tabular-nums">
                          <Phone className="w-3.5 h-3.5" />
                          {l.phone}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {peutModifier && !titulaire && (
                  <RetirerBouton dossierId={params.id} learnerId={l.id} nom={nom} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
