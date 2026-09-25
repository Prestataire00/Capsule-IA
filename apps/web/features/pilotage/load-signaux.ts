import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  arriereQualiopi,
  classer,
  compterParGravite,
  convocationsNonOuvertes,
  devisQuiExpirent,
  financeursSansReponse,
  heuresSousLeVolume,
  qualiopiBloquant,
  seancesIncompletes,
  type Gravite,
  type Signal,
} from './signaux';

/**
 * Rassemble ce qui réclame l'attention aujourd'hui.
 *
 * Les décisions vivent dans `signaux.ts`, qui est pur et testé ; ici on ne fait
 * que lire et brancher. Chaque lecture est isolée : une table illisible fait
 * taire SON détecteur, pas les autres. Un tableau de bord qui disparaît parce
 * qu'une requête a échoué est pire qu'un tableau incomplet.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type SignauxDuJour = {
  readonly signaux: Signal[];
  readonly parGravite: Record<Gravite, number>;
  /** Conformité en retard de longue date : un rappel, pas vingt lignes. */
  readonly arriere: { dossiers: number; indicateurs: number };
};

const VIDE: SignauxDuJour = {
  signaux: [],
  parGravite: { bloquant: 0, urgent: 0, a_surveiller: 0 },
  arriere: { dossiers: 0, indicateurs: 0 },
};

/** Une lecture qui échoue rend une liste vide, et le dit. */
async function lire<T>(nom: string, requete: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await requete;
    if (error) {
      console.error('[signaux] lecture impossible', nom, (error as { message?: string }).message);
      return [];
    }
    return (data ?? []) as T[];
  } catch (e) {
    console.error('[signaux] lecture impossible', nom, e);
    return [];
  }
}

export async function loadSignauxDuJour(sb: Client, organizationId: string): Promise<SignauxDuJour> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  // Plus loin que la plus large fenêtre des détecteurs (14 j) : au-delà, un
  // signal n'a pas encore lieu d'être.
  const horizon = new Date(Date.now() + 30 * 86_400_000).toISOString();

  const [dossiers, financeurs, funders, heures, quotes, checklists, sessions, liens, participants, emails] =
    await Promise.all([
      lire<{ id: string; reference: string; start_date: string | null; end_date: string | null }>(
        'dossiers',
        sb
          .schema('app')
          .from('dossiers')
          .select('id, reference, start_date, end_date')
          .eq('organization_id', organizationId)
          .is('deleted_at', null),
      ),
      lire<{
        dossier_id: string;
        funder_id: string;
        status: string;
        submitted_at: string | null;
        amount_cents: number | null;
      }>(
        'dossier_funders',
        sb
          .schema('app')
          .from('dossier_funders')
          .select('dossier_id, funder_id, status, submitted_at, amount_cents')
          .eq('organization_id', organizationId),
      ),
      lire<{ id: string; name: string }>(
        'funders',
        sb.schema('app').from('funders').select('id, name').eq('organization_id', organizationId),
      ),
      lire<{
        dossier_id: string;
        hours_planned: number | null;
        projected_final_hours: number | null;
        at_risk: boolean | null;
      }>(
        'dossier_hours_tracking',
        sb
          .schema('app')
          .from('dossier_hours_tracking')
          .select('dossier_id, hours_planned, projected_final_hours, at_risk')
          .eq('at_risk', true),
      ),
      lire<{
        id: string;
        reference: string | null;
        status: string;
        valid_until: string;
        total_cents: number | null;
        recipient_name: string | null;
      }>(
        'quotes',
        sb
          .schema('app')
          .from('quotes')
          .select('id, reference, status, valid_until, total_cents, recipient_name')
          .eq('organization_id', organizationId)
          .eq('status', 'sent')
          .is('deleted_at', null),
      ),
      lire<{ dossier_id: string; blocking_missing: number }>(
        'qualiopi_dossier_checklists',
        sb
          .schema('app')
          .from('qualiopi_dossier_checklists')
          .select('dossier_id, blocking_missing')
          .eq('organization_id', organizationId)
          .gt('blocking_missing', 0),
      ),
      lire<{ id: string; title: string | null; starts_at: string; status: string; dossier_id: string | null }>(
        'sessions',
        sb
          .schema('app')
          .from('sessions')
          .select('id, title, starts_at, status, dossier_id')
          .eq('organization_id', organizationId)
          .neq('status', 'cancelled')
          .gte('starts_at', new Date().toISOString())
          .lt('starts_at', horizon),
      ),
      lire<{ session_id: string; deleted_at: string | null }>(
        'session_trainers',
        sb.schema('app').from('session_trainers').select('session_id, deleted_at'),
      ),
      lire<{ session_id: string; participant_kind: string }>(
        'session_participants',
        sb
          .schema('app')
          .from('session_participants')
          .select('session_id, participant_kind')
          .eq('organization_id', organizationId),
      ),
      lire<{ recipient: string; sent_at: string; opened_at: string | null; dossier_id: string | null }>(
        'email_log',
        sb
          .schema('app')
          .from('email_log')
          .select('recipient, sent_at, opened_at, dossier_id')
          .eq('organization_id', organizationId)
          .eq('kind', 'convocation_j7')
          .is('opened_at', null)
          .gte('sent_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
      ),
    ]);

  if (dossiers.length === 0 && sessions.length === 0) return VIDE;

  const refDe = new Map(dossiers.map((d) => [d.id, d.reference]));
  const dossierDe = new Map(dossiers.map((d) => [d.id, d]));
  const nomFinanceur = new Map(funders.map((f) => [f.id, f.name]));
  const avecFormateur = new Set(liens.filter((l) => !l.deleted_at).map((l) => l.session_id));
  const avecApprenant = new Set(
    participants.filter((p) => p.participant_kind === 'learner').map((p) => p.session_id),
  );
  // Une convocation vise un dossier ; la séance concernée est la prochaine à venir.
  const prochaineSeanceDuDossier = new Map<string, (typeof sessions)[number]>();
  for (const s of [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    if (s.dossier_id && !prochaineSeanceDuDossier.has(s.dossier_id)) {
      prochaineSeanceDuDossier.set(s.dossier_id, s);
    }
  }

  const lignesQualiopi = checklists.map((c) => ({
    dossierId: c.dossier_id,
    reference: refDe.get(c.dossier_id) ?? c.dossier_id.slice(0, 8),
    bloquantsManquants: Number(c.blocking_missing ?? 0),
    debutLe: dossierDe.get(c.dossier_id)?.start_date ?? null,
  }));

  const signaux = [
    ...financeursSansReponse(
      financeurs.map((f) => ({
        dossierId: f.dossier_id,
        reference: refDe.get(f.dossier_id) ?? f.dossier_id.slice(0, 8),
        financeur: nomFinanceur.get(f.funder_id) ?? 'Financeur',
        statut: f.status,
        deposeLe: f.submitted_at,
        montantCents: f.amount_cents,
      })),
      aujourdhui,
    ),
    ...heuresSousLeVolume(
      heures.map((h) => ({
        dossierId: h.dossier_id,
        reference: refDe.get(h.dossier_id) ?? h.dossier_id.slice(0, 8),
        heuresFinancees: Number(h.hours_planned ?? 0),
        heuresProjetees: Number(h.projected_final_hours ?? 0),
        aRisque: Boolean(h.at_risk),
        finLe: dossierDe.get(h.dossier_id)?.end_date ?? null,
      })),
      aujourdhui,
    ),
    ...devisQuiExpirent(
      quotes.map((q) => ({
        devisId: q.id,
        reference: q.reference ?? 'Devis',
        client: q.recipient_name ?? 'Client',
        statut: q.status,
        valideJusquau: q.valid_until,
        totalCents: Number(q.total_cents ?? 0),
      })),
      aujourdhui,
    ),
    ...seancesIncompletes(
      sessions.map((s) => ({
        sessionId: s.id,
        intitule: s.title ?? 'Séance',
        debutLe: s.starts_at,
        aUnFormateur: avecFormateur.has(s.id),
        aDesParticipants: avecApprenant.has(s.id),
      })),
      aujourdhui,
    ),
    ...qualiopiBloquant(lignesQualiopi, aujourdhui),
    ...convocationsNonOuvertes(
      emails.flatMap((e) => {
        const seance = e.dossier_id ? prochaineSeanceDuDossier.get(e.dossier_id) : null;
        if (!seance) return [];
        return [
          {
            dossierId: e.dossier_id!,
            sessionId: seance.id,
            intitule: seance.title ?? 'Séance',
            destinataire: e.recipient,
            envoyeeLe: e.sent_at,
            ouverte: false,
            seanceLe: seance.starts_at,
          },
        ];
      }),
      aujourdhui,
    ),
  ];

  const classes = classer(signaux, aujourdhui);
  return {
    signaux: classes,
    parGravite: compterParGravite(classes),
    arriere: arriereQualiopi(lignesQualiopi, aujourdhui),
  };
}
