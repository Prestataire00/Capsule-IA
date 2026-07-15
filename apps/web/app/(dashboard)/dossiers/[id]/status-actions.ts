'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { DossierStatusValues, type DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';
import { canReachStatus } from '@/features/dossier/status-transitions';

// Traduit l'exception SQL du gate Qualiopi en message lisible.
function explainGate(message: string | undefined): string {
  if (!message) return 'Transition refusée.';
  if (message.includes('qualiopi_entry_blocked')) {
    const m = message.split('qualiopi_entry_blocked:')[1]?.trim();
    return `Démarrage bloqué : indicateurs Qualiopi d'entrée manquants (${m ?? '—'}).`;
  }
  if (message.includes('qualiopi_closing_blocked')) {
    const m = message.split('qualiopi_closing_blocked:')[1]?.trim();
    return `Clôture bloquée : indicateurs Qualiopi de clôture manquants (${m ?? '—'}).`;
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

    const { data: updated, error } = await sb
      .schema('app')
      .from('dossiers')
      .update({ status: parsedInput.to, updated_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.dossierId)
      .select('id');

    // Le trigger Qualiopi (tg_dossiers_qualiopi_gate) lève une exception si les
    // indicateurs d'entrée/clôture manquent → message explicite.
    if (error) return { ok: false as const, error: 'blocked' as const, message: explainGate(error.message) };
    // 0 ligne = RLS : dossier verrouillé (clos/archivé) ou droits insuffisants.
    if (!updated || (updated as unknown[]).length === 0) {
      return { ok: false as const, error: 'forbidden' as const };
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}`);
    revalidatePath('/dossiers');
    return { ok: true as const };
  });
