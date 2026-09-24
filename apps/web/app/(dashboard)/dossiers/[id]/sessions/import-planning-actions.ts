'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { extractPlanning } from '@/features/import/extract-planning';
import {
  heuresDuPlanning,
  horsPeriode,
  trierPlanning,
  type Modalite,
  type SeanceRejetee,
} from '@/features/import/planning-seances';
import type { ImportSession } from '@/features/import/convention-types';
import { parisIso } from '@/features/import/paris-time';

/**
 * Importer le planning d'un dossier depuis un document.
 *
 * Deux temps, volontairement séparés : on lit, on montre, et on ne crée qu'une
 * fois l'organisme d'accord. Créer directement ce que le modèle a compris
 * reviendrait à lui faire signer des séances qu'il n'a pas vues.
 */

const TYPES_ACCEPTES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const TAILLE_MAX = 12 * 1024 * 1024;

export type LecturePlanning =
  | {
      ok: true;
      seances: ImportSession[];
      rejetees: SeanceRejetee[];
      heures: number;
      /** Séances hors de la période du dossier — signalées, pas écartées. */
      debordent: ImportSession[];
    }
  | { ok: false; error: string };

export type CreationPlanning = { ok: true; creees: number; ignorees: number } | { ok: false; error: string };

type Contexte = {
  organizationId: string;
  formationId: string | null;
  companyId: string | null;
  modalite: Modalite;
  debut: string | null;
  fin: string | null;
};

async function garder(dossierId: string): Promise<{ ok: true; ctx: Contexte } | { ok: false; error: string }> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage') {
    return { ok: false, error: "Vous n'avez pas le droit de modifier ce dossier." };
  }

  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, formation_id, company_id, modality, start_date, end_date')
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as {
    organization_id: string;
    formation_id: string | null;
    company_id: string | null;
    modality: string | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
  if (!d || d.organization_id !== me.organizationId) {
    return { ok: false, error: "Ce dossier n'appartient pas à votre organisation." };
  }

  const modalite: Modalite =
    d.modality === 'distanciel' || d.modality === 'hybride' ? d.modality : 'presentiel';
  return {
    ok: true,
    ctx: {
      organizationId: d.organization_id,
      formationId: d.formation_id,
      companyId: d.company_id,
      modalite,
      debut: d.start_date,
      fin: d.end_date,
    },
  };
}

/** Premier temps : lire le document et rendre ce qu'on y a trouvé. */
export async function lirePlanning(dossierId: string, form: FormData): Promise<LecturePlanning> {
  const garde = await garder(dossierId);
  if (!garde.ok) return garde;

  const fichiers = form.getAll('document').filter((f): f is File => f instanceof File && f.size > 0);
  if (fichiers.length === 0) return { ok: false, error: 'Choisissez un document à lire.' };

  const documents: Array<{ name: string; base64: string; mediaType: string }> = [];
  for (const f of fichiers) {
    if (!TYPES_ACCEPTES.includes(f.type)) {
      return { ok: false, error: `« ${f.name} » : seuls les PDF et les images sont lus.` };
    }
    if (f.size > TAILLE_MAX) {
      return { ok: false, error: `« ${f.name} » dépasse 12 Mo.` };
    }
    documents.push({
      name: f.name,
      base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
      mediaType: f.type,
    });
  }

  const lu = await extractPlanning(documents);
  if (!lu.ok) {
    return {
      ok: false,
      error:
        lu.reason === 'no_api_key'
          ? "La lecture par IA n'est pas configurée (clé Anthropic absente)."
          : `Le document n'a pas pu être lu : ${lu.detail ?? 'échec de l’extraction'}`,
    };
  }

  const trie = trierPlanning(lu.seances, { modalitePardefaut: garde.ctx.modalite });
  if (trie.retenues.length === 0) {
    return {
      ok: false,
      error:
        trie.rejetees.length > 0
          ? `Aucune séance exploitable : ${trie.rejetees.length} ligne(s) lue(s) mais incomplète(s).`
          : 'Aucune séance datée trouvée dans ce document.',
    };
  }

  return {
    ok: true,
    seances: trie.retenues,
    rejetees: trie.rejetees,
    heures: heuresDuPlanning(trie.retenues),
    debordent: horsPeriode(trie.retenues, { debut: garde.ctx.debut, fin: garde.ctx.fin }),
  };
}

/**
 * Second temps : créer les séances confirmées.
 *
 * Les stagiaires du dossier y sont inscrits, comme le fait l'import de
 * convention — une séance sans participant n'ouvre ni émargement ni espace.
 */
export async function creerSeancesDuPlanning(
  dossierId: string,
  seances: ImportSession[],
): Promise<CreationPlanning> {
  const garde = await garder(dossierId);
  if (!garde.ok) return garde;
  if (seances.length === 0) return { ok: false, error: 'Aucune séance à créer.' };

  const sb = supabaseAdmin();

  // Séances déjà posées sur ce dossier : réimporter le même document ne doit
  // pas doubler le planning.
  const { data: existantes } = await sb
    .schema('app')
    .from('sessions')
    .select('starts_at')
    .eq('dossier_id', dossierId);
  const deja = new Set(
    ((existantes ?? []) as Array<{ starts_at: string }>).map((s) => s.starts_at),
  );

  const { data: groupe } = await sb
    .schema('app')
    .from('dossier_learners' as never)
    .select('learner_id')
    .eq('dossier_id', dossierId);
  const apprenants = [
    ...new Set(((groupe ?? []) as unknown as Array<{ learner_id: string }>).map((l) => l.learner_id)),
  ];

  let creees = 0;
  let ignorees = 0;

  for (const s of seances) {
    const debut = parisIso(s.date, s.startTime);
    const fin = parisIso(s.date, s.endTime);
    if (!debut || !fin) {
      ignorees += 1;
      continue;
    }
    if (deja.has(debut)) {
      ignorees += 1;
      continue;
    }

    const ligne: Record<string, unknown> = {
      organization_id: garde.ctx.organizationId,
      dossier_id: dossierId,
      formation_id: garde.ctx.formationId,
      title: s.label || null,
      modality: s.modality,
      status: 'planned',
      starts_at: debut,
      ends_at: fin,
      location: s.location || null,
      // Répartir un forfait entre les séances serait un calcul : on s'abstient.
      price_cents: null,
      ...(garde.ctx.companyId ? { company_id: garde.ctx.companyId } : {}),
    };

    const { data: creee, error } = await sb
      .schema('app')
      .from('sessions')
      .insert(ligne as never)
      .select('id')
      .single();
    if (error || !creee) {
      console.error('[import planning] séance non créée', s.date, error?.message);
      ignorees += 1;
      continue;
    }
    deja.add(debut);
    creees += 1;

    if (apprenants.length > 0) {
      await sb
        .schema('app')
        .from('session_participants')
        .upsert(
          apprenants.map((id) => ({
            session_id: (creee as { id: string }).id,
            organization_id: garde.ctx.organizationId,
            participant_kind: 'learner',
            learner_id: id,
            source: 'manual_add',
          })) as never,
          { onConflict: 'session_id,participant_kind,participant_id' },
        );
    }
  }

  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath(`/dossiers/${dossierId}/sessions`);
  revalidatePath('/sessions');
  revalidatePath('/planning');

  if (creees === 0) {
    return { ok: false, error: 'Aucune séance créée : elles existaient déjà sur ce dossier.' };
  }
  return { ok: true, creees, ignorees };
}
