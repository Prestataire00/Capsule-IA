import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { ContexteFormation } from './generate-with-ai';
import type { Ancrage } from './store';

/**
 * Ce que l'IA doit savoir pour proposer un exercice qui tienne : la formation,
 * ses objectifs, son programme, sa durée, sa modalité, son public et le nombre
 * de participants. Sans cela elle produirait un contenu générique, c'est-à-dire
 * inutilisable.
 */

const jourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

/** Le programme vit dans `metadata.catalog`, sous des formes accumulées au fil des versions. */
function extraireProgramme(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const catalog = (metadata as { catalog?: unknown }).catalog;
  if (!catalog || typeof catalog !== 'object') return null;
  const c = catalog as Record<string, unknown>;

  const morceaux: string[] = [];
  if (typeof c.programContent === 'string' && c.programContent.trim()) morceaux.push(c.programContent.trim());
  if (typeof c.pedagogicalMethod === 'string' && c.pedagogicalMethod.trim()) {
    morceaux.push(`Méthode pédagogique : ${c.pedagogicalMethod.trim()}`);
  }
  return morceaux.length > 0 ? morceaux.join('\n\n') : null;
}

/**
 * Un cours ancré à une séance n'a pas de dossier désigné (0174) : on remonte
 * alors au dossier que la séance sert — le sien, ou le premier de ceux qu'elle
 * regroupe. C'est lui qui porte la formation, sa durée et sa modalité.
 */
async function dossierDeReference(ancrage: Ancrage): Promise<string | null> {
  if (ancrage.type === 'dossier') return ancrage.id;
  const admin = supabaseAdmin();

  const { data: seance } = await admin
    .schema('app')
    .from('sessions')
    .select('dossier_id')
    .eq('id', ancrage.id)
    .maybeSingle();
  const direct = (seance as { dossier_id: string | null } | null)?.dossier_id ?? null;
  if (direct) return direct;

  const { data: liens } = await admin
    .schema('app')
    .from('session_dossiers')
    .select('dossier_id')
    .eq('session_id', ancrage.id)
    .limit(1);
  return ((liens ?? []) as Array<{ dossier_id: string }>)[0]?.dossier_id ?? null;
}

export async function chargerContexteFormation(
  ancrage: Ancrage,
  options: { sessionId?: string | null; consigne?: string | null } = {},
): Promise<ContexteFormation | null> {
  const admin = supabaseAdmin();
  const dossierId = await dossierDeReference(ancrage);
  if (!dossierId) return null;

  const { data: dossierRow } = await admin
    .schema('app')
    .from('dossiers')
    .select('id, formation_id, total_hours, modality')
    .eq('id', dossierId)
    .maybeSingle();
  const dossier = dossierRow as {
    formation_id: string | null;
    total_hours: number | string | null;
    modality: string | null;
  } | null;
  if (!dossier) return null;

  const { data: formationRow } = dossier.formation_id
    ? await admin
        .schema('app')
        .from('formations')
        .select('title, summary, objectives, target_audience, default_duration_hours, metadata')
        .eq('id', dossier.formation_id)
        .maybeSingle()
    : { data: null };
  const formation = formationRow as {
    title: string;
    summary: string | null;
    objectives: string[] | null;
    target_audience: string | null;
    default_duration_hours: number | string | null;
    metadata: unknown;
  } | null;

  // Participants réellement inscrits sur les séances du dossier.
  const [liens, directes] = await Promise.all([
    admin.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', dossierId),
    admin.schema('app').from('sessions').select('id').eq('dossier_id', dossierId).neq('status', 'cancelled'),
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
  const nbParticipants = new Set(
    ((participants ?? []) as Array<{ learner_id: string | null }>)
      .map((p) => p.learner_id)
      .filter((x): x is string => Boolean(x)),
  ).size;

  const { data: seanceRow } = options.sessionId
    ? await admin.schema('app').from('sessions').select('title, starts_at').eq('id', options.sessionId).maybeSingle()
    : { data: null };
  const seance = seanceRow as { title: string | null; starts_at: string } | null;

  const heures = Number(dossier.total_hours ?? formation?.default_duration_hours ?? 0);

  return {
    formation: formation?.title ?? 'Formation',
    objectifs: (formation?.objectives ?? []).filter((o): o is string => typeof o === 'string' && o.trim().length > 0),
    programme: extraireProgramme(formation?.metadata) ?? formation?.summary ?? null,
    dureeHeures: heures > 0 ? heures : null,
    modalite: dossier.modality ?? null,
    participants: nbParticipants > 0 ? nbParticipants : null,
    public: formation?.target_audience ?? null,
    seance: seance ? `${seance.title ?? 'Séance'} du ${jourFmt.format(new Date(seance.starts_at))}` : null,
    consigne: options.consigne ?? null,
  };
}
