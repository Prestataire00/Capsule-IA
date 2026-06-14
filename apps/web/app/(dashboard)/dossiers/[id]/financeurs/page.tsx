// ARCHETYPE: workflow
// Justification: tâches d'envoi par financeur (brouillon assisté + envoi 1 clic).

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { prepareFunderTaskDraft, sendFunderTask } from './actions';

const STATUS_LABEL: Record<string, string> = {
  pending: 'À préparer', ready: 'Échéance proche', drafted: 'Brouillon prêt',
  sent: 'Envoyé', done: 'Terminé', skipped: 'Ignoré',
};

export default async function FinanceursPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier } = await sb.schema('app').from('dossiers')
    .select('id').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();

  // Prod-safe : si dossier_funder_tasks n'est pas encore migrée, data=null → liste vide.
  const { data: tasks } = await sb.schema('app').from('dossier_funder_tasks')
    .select('id, due_date, status, draft_subject, resolved_attachments, funders(name)')
    .eq('dossier_id', params.id)
    .order('due_date', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (tasks as any[]) ?? [];

  return (
    <div className="space-y-6">
      <SectionLabel>Financeurs — documents à transmettre ({rows.length})</SectionLabel>

      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">
          Aucune tâche financeur. Rattachez un financeur au dossier pour générer le calendrier d'envoi.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => {
            const atts = (t.resolved_attachments as Array<unknown> | null) ?? [];
            const canPrepare = t.status !== 'sent' && t.status !== 'done';
            return (
              <li key={t.id} className="flex items-center justify-between gap-4 rounded border border-zinc-200/60 dark:border-zinc-800 p-3">
                <div className="min-w-0">
                  <div className="font-medium text-[13px]">{t.funders?.name ?? 'Financeur'}</div>
                  <div className="text-[11px] text-zinc-500">
                    {STATUS_LABEL[t.status] ?? t.status}
                    {t.due_date ? ` · échéance ${new Date(t.due_date).toLocaleDateString('fr-FR')}` : ''}
                    {atts.length ? ` · ${atts.length} pièce(s)` : ''}
                  </div>
                  {t.draft_subject && <div className="truncate text-[12px] text-zinc-600 dark:text-zinc-400">Objet : {t.draft_subject}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {t.status === 'sent' || t.status === 'done' ? (
                    <StatusPill tone="success">envoyé</StatusPill>
                  ) : (
                    <>
                      {canPrepare && (
                        <form action={async () => { 'use server'; await prepareFunderTaskDraft(t.id, params.id); }}>
                          <button type="submit" className="border border-zinc-200/60 dark:border-zinc-800 text-[12px] px-3 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition">
                            Préparer
                          </button>
                        </form>
                      )}
                      {t.status === 'drafted' && (
                        <form action={async () => { 'use server'; await sendFunderTask(t.id, params.id); }}>
                          <button type="submit" className="bg-orange-500 text-white text-[12px] px-3 py-1 rounded-md hover:bg-orange-600 transition">
                            Envoyer
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
