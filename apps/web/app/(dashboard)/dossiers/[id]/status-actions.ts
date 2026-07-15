'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { DossierStatusValues, type DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';
import { canReachStatus } from '@/features/dossier/status-transitions';

// Ordre du cycle de vie (transitions « vers l'avant »).
const LIFECYCLE: DossierStatus[] = [
  'draft',
  'pending_validation',
  'scheduled',
  'active',
  'completed',
  'closed',
  'archived',
];

// Suite d'étapes pour atteindre `to` depuis `from`. En avant : on passe par les
// statuts intermédiaires (la base refuse les sauts). Sinon : une seule étape.
function forwardSteps(from: DossierStatus, to: DossierStatus): DossierStatus[] {
  const fi = LIFECYCLE.indexOf(from);
  const ti = LIFECYCLE.indexOf(to);
  if (fi !== -1 && ti !== -1 && ti > fi) return LIFECYCLE.slice(fi + 1, ti + 1);
  return [to];
}

// Traduit l'exception SQL (gate Qualiopi ou machine à états) en message lisible.
function explainGate(message: string | undefined): string {
  if (!message) return 'Transition refusée.';
  if (message.includes('qualiopi_entry_blocked')) {
    const m = message.split('qualiopi_entry_blocked:')[1]?.trim();
    return `Démarrage bloqué : indicateurs Qualiopi d'entrée manquants (${m ?? '—'}). Corrigez-les dans l'onglet Qualiopi.`;
  }
  if (message.includes('qualiopi_closing_blocked')) {
    const m = message.split('qualiopi_closing_blocked:')[1]?.trim();
    return `Clôture bloquée : indicateurs Qualiopi de clôture manquants (${m ?? '—'}). Corrigez-les dans l'onglet Qualiopi.`;
  }
  if (/invalid dossier transition/i.test(message)) {
    return "Étape de statut non autorisée à ce stade du dossier.";
  }
  return message;
}

export const changeDossierStatus = authActionClient
  .schema(z.object({ dossierId: z.string().uuid(), to: z.enum(DossierStatusValues) }))
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;

    const { data: row } = await sb
      .schema('app')
      .from('dossiers')
      .select('status')
      .eq('id', parsedInput.dossierId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!row) return { ok: false as const, error: 'not_found' as const };
    const from = (row as { status: DossierStatus }).status;

    if (from === parsedInput.to) return { ok: true as const };
    if (!canReachStatus(from, parsedInput.to)) {
      return { ok: false as const, error: 'invalid_transition' as const };
    }

    // La base impose la machine à états stricte (pas de saut brouillon→actif).
    // Pour un « un clic » vers l'avant, on avance par les étapes intermédiaires
    // valides ; on s'arrête au premier blocage (ex. gate Qualiopi) en le signalant.
    const steps = forwardSteps(from, parsedInput.to);

    let advanced = false;
    for (const to of steps) {
      const { data: updated, error } = await sb
        .schema('app')
        .from('dossiers')
        .update({ status: to, updated_at: new Date().toISOString() } as never)
        .eq('id', parsedInput.dossierId)
        .select('id');

      if (error) {
        // Gate Qualiopi ou machine à états → message explicite. On rafraîchit
        // quand même si des étapes intermédiaires ont abouti.
        if (advanced) {
          revalidatePath(`/dossiers/${parsedInput.dossierId}`);
          revalidatePath('/dossiers');
        }
        return { ok: false as const, error: 'blocked' as const, message: explainGate(error.message), advanced };
      }
      if (!updated || (updated as unknown[]).length === 0) {
        return { ok: false as const, error: 'forbidden' as const, advanced };
      }
      advanced = true;
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}`);
    revalidatePath('/dossiers');
    return { ok: true as const };
  });
