// ARCHETYPE: command
// Justification: envois automatiques qui concernent la session — ceux de Capsule et les programmations de l'organisme, activables séance par séance.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Mail, Zap } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { AUTOMATION_KEYS, loadSessionAutomations, scheduleKey } from '@/features/automation/session-automations';
import { AutomationToggle } from './automation-toggle';

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

type Regle = { id: string; name: string; anchor: string; offset_days: number; recipient_kind: string; subject: string; enabled: boolean };

export default async function SessionAutomatisations({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const gerer = await canManageSection('dossiers');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;

  const [{ data }, reglages] = await Promise.all([
    db
      .schema('app')
      .from('email_schedules')
      .select('id, name, anchor, offset_days, recipient_kind, subject, enabled')
      .is('deleted_at', null)
      .order('offset_days', { ascending: true }),
    loadSessionAutomations(db, params.id),
  ]);
  const regles = (data ?? []) as Regle[];
  const actif = (cle: string) => reglages.get(cle) ?? true;

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
        E-mails envoyés automatiquement aux participants et au formateur de cette session. Chaque envoi se coupe pour{' '}
        <strong>cette séance seulement</strong> — les autres séances et les réglages de l’organisme ne changent pas.
      </p>

      <section className="space-y-2">
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Envois de Capsule</h2>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {AUTOMATION_KEYS.map((e) => (
            <li key={e.key} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <Mail className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{e.label}</p>
                  <p className="text-[12px] text-zinc-500">{e.quand}.</p>
                </div>
              </div>
              {gerer ? (
                <AutomationToggle sessionId={params.id} cle={e.key} actif={actif(e.key)} libelle={e.label} />
              ) : (
                <StatusPill tone={actif(e.key) ? 'success' : 'neutral'}>{actif(e.key) ? 'Actif' : 'Coupé'}</StatusPill>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Programmations de l’organisme</h2>
          <Link href="/emails/programmation" className="text-[12px] text-orange-600 dark:text-orange-400 hover:underline">
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
                    {!r.enabled && <p className="text-[11px] text-zinc-400 mt-0.5">En pause pour tout l’organisme.</p>}
                  </div>
                </div>
                {gerer ? (
                  <AutomationToggle
                    sessionId={params.id}
                    cle={scheduleKey(r.id)}
                    actif={actif(scheduleKey(r.id))}
                    libelle={r.name}
                  />
                ) : (
                  <StatusPill tone={actif(scheduleKey(r.id)) ? 'success' : 'neutral'}>
                    {actif(scheduleKey(r.id)) ? 'Actif' : 'Coupé'}
                  </StatusPill>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
