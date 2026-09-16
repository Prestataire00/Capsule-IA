// ARCHETYPE: command
// Justification: confier le dossier à un formateur — c'est ce rattachement qui
// lui ouvre l'affaire dans son espace, sans la partie financière.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, UserCog } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { ConfierForm, RetirerButton, type FormateurOption } from './confier.client';

export const dynamic = 'force-dynamic';

type Rattache = { trainer_id: string; is_lead: boolean };

export default async function DossierFormateursTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const gerer = await canManageSection('dossiers');

  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!dossier) notFound();

  const [{ data: liens }, { data: tous }] = await Promise.all([
    sb.schema('app').from('dossier_trainers').select('trainer_id, is_lead').eq('dossier_id', params.id),
    sb
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name, email')
      .is('deleted_at', null)
      .order('last_name', { ascending: true }),
  ]);

  const rattaches = (liens ?? []) as Rattache[];
  const formateurs = ((tous ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).map(
    (t) => ({
      id: t.id,
      label: `${[t.first_name, t.last_name].filter(Boolean).join(' ').trim() || 'Formateur'}${t.email ? ` · ${t.email}` : ''}`,
    }),
  );
  const parId = new Map(formateurs.map((f) => [f.id, f]));
  const dejaLa = new Set(rattaches.map((r) => r.trainer_id));
  const disponibles: FormateurOption[] = formateurs.filter((f) => !dejaLa.has(f.id));

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
        Confier ce dossier à un formateur lui en ouvre la gestion depuis son espace : informations, client et référent,
        apprenants, séances et émargement. Il ne voit ni tarif, ni devis, ni facture, ni financeur, ni dépense.
      </p>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
        <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.teal.soft}`}>
            <UserCog className="w-4 h-4" />
          </span>
          Formateurs du dossier
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.teal.soft}`}>
            {rattaches.length}
          </span>
        </p>

        {rattaches.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Aucun formateur sur ce dossier"
            description="Confiez-le pour que le formateur puisse le gérer depuis son espace."
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {rattaches.map((r) => {
              const f = parId.get(r.trainer_id);
              const nom = f?.label.split(' · ')[0] ?? 'Formateur';
              return (
                <li key={r.trainer_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Link
                      href={`/formateurs/${r.trainer_id}`}
                      className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-300"
                    >
                      {nom}
                    </Link>
                    {r.is_lead && (
                      <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${ACCENTS.orange.soft}`}>
                        référent pédagogique
                      </span>
                    )}
                    {f?.label.includes(' · ') && (
                      <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                        {f.label.split(' · ')[1]}
                      </span>
                    )}
                  </span>
                  {gerer && <RetirerButton dossierId={params.id} trainerId={r.trainer_id} nom={nom} />}
                </li>
              );
            })}
          </ul>
        )}

        {gerer && <ConfierForm dossierId={params.id} disponibles={disponibles} />}
      </section>

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-start gap-1.5 max-w-2xl">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
        Le cloisonnement est tenu par les requêtes de l’espace formateur, qui n’appellent jamais les colonnes
        financières — la base, elle, lui ouvre la ligne du dossier pour qu’il puisse travailler.
      </p>
    </div>
  );
}
