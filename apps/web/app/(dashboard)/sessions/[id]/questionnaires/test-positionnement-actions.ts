'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { genererTestPositionnement, type ErreurTest } from '@/features/questionnaire/test-positionnement';

const MESSAGES: Record<ErreurTest, string> = {
  formation_introuvable: 'Formation introuvable.',
  sans_objectifs: 'La formation n’a ni programme, ni contenu, ni objectifs : renseignez-les d’abord (menu Formations).',
  ia_indisponible: 'L’assistant IA n’est pas configuré.',
  generation_echouee: 'La génération n’a pas abouti. Réessayez.',
  enregistrement_echoue: 'Le test n’a pas pu être enregistré.',
};

/** Génère (ou régénère) le test de positionnement de la formation de la séance. */
export async function genererTestDeLaSeance(sessionId: string): Promise<{ ok: true; templateId: string; questions: number } | { ok: false; error: string }> {
  const me = await getCurrentMember();
  if (!me || (can(me.role, 'catalogue') !== 'manage' && can(me.role, 'dossiers') !== 'manage')) {
    return { ok: false, error: 'Votre rôle ne permet pas de créer un questionnaire.' };
  }
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: 'Séance introuvable.' };

  const sb = supabaseAdmin();
  const { data } = await sb.schema('app').from('sessions').select('organization_id, formation_id, dossier_id').eq('id', sessionId).maybeSingle();
  const s = data as { organization_id: string; formation_id: string | null; dossier_id: string | null } | null;
  if (!s || s.organization_id !== me.organizationId) return { ok: false, error: 'Séance introuvable.' };
  let formationId = s.formation_id;
  if (!formationId && s.dossier_id) {
    const { data: d } = await sb.schema('app').from('dossiers').select('formation_id').eq('id', s.dossier_id).maybeSingle();
    formationId = (d as { formation_id: string | null } | null)?.formation_id ?? null;
  }
  if (!formationId) return { ok: false, error: 'Cette séance n’est rattachée à aucune formation.' };

  const r = await genererTestPositionnement(sb as never, { organizationId: me.organizationId, formationId });
  if (!r.ok) return { ok: false, error: MESSAGES[r.error] };
  revalidatePath(`/sessions/${sessionId}/questionnaires`);
  return r;
}
