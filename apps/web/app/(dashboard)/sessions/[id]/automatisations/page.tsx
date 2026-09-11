// ARCHETYPE: command
// Justification: envois automatiques qui concernent la session — ceux de Capsule et les programmations de l'organisme.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Mail, Zap } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';

export const dynamic = 'force-dynamic';

const ANCRES: Record<string, string> = {
  first_session_start: 'la première séance',
  last_session_end: 'la fin de la dernière séance',
  dossier_start: 'le début du dossier',
  dossier_end: 'la fin du dossier',
  dossier_created: 'la création du dossier',
  devis_signed: 'la signature du devis',
  convention_signed: 'la signature de la convention',
  invoice_paid: 'le paiement de la facture',
};
const DESTINATAIRES: Record<string, string> = { learner: 'aux apprenants', trainer: 'au formateur' };

function quand(ancre: string, decalage: number): string {
  const cible = ANCRES[ancre] ?? ancre;
  if (decalage === 0) return `Le jour de ${cible}`;
  const n = Math.abs(decalage);
  return `${n} jour${n > 1 ? 's' : ''} ${decalage < 0 ? 'avant' : 'après'} ${cible}`;
}

/** Envois intégrés à Capsule (tâches programmées). */
const INTEGRES = [
  { titre: 'Convocation', quand: '7 jours avant la séance', a: 'aux apprenants' },
  { titre: 'Liens d’émargement', quand: 'Au début de chaque demi-journée, si l’envoi automatique est activé dans les paramètres', a: 'aux apprenants' },
  { titre: 'Questionnaire de satisfaction à chaud', quand: 'À la fin de la formation', a: 'aux apprenants' },
  { titre: 'Retour du formateur', quand: 'À la fin du dossier', a: 'au formateur' },
];

type Regle = { id: string; name: string; anchor: string; offset_days: number; recipient_kind: string; subject: string; enabled: boolean };

export default async function SessionAutomatisations({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;
  const { data } = await db
    .schema('app')
    .from('email_schedules')
    .select('id, name, anchor, offset_days, recipient_kind, subject, enabled')
    .is('deleted_at', null)
    .order('offset_days', { ascending: true });
  const regles = (data ?? []) as Regle[];

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
        E-mails envoyés automatiquement aux participants et au formateur de cette session : ceux de Capsule, puis les programmations de
        votre organisme.
      </p>

      <section className="space-y-2">
        <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Envois de Capsule</h2>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {INTEGRES.map((e) => (
            <li key={e.titre} className="px-4 py-3 flex items-start gap-3">
              <Mail className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{e.titre}</p>
                <p className="text-[12px] text-zinc-500">
                  {e.quand}, {e.a}.
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Programmations de l’organisme</h2>
          <Link href="/programmation" className="text-[12px] text-orange-600 dark:text-orange-400 hover:underline">
            Gérer les programmations →
          </Link>
        </div>
        {regles.length === 0 ? (
          <p className="text-[13px] text-zinc-500 bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-6 text-center">
            Aucune programmation. Créez-en une pour envoyer un e-mail à une date clé (ex. 3 jours avant la première séance).
          </p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {regles.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Zap className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                    <p className="text-[12px] text-zinc-500">
                      {quand(r.anchor, r.offset_days)}, {DESTINATAIRES[r.recipient_kind] ?? r.recipient_kind} — « {r.subject} »
                    </p>
                  </div>
                </div>
                <StatusPill tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'Active' : 'En pause'}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
