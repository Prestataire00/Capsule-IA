// ARCHETYPE: shared
// Le fil des échanges d'une demande : ce qu'on a noté, et ce qui est parti.
// Module pur.
//
// La fiche ne montrait que les notes saisies à la main. Les e-mails partis tout
// seuls (confirmation, fiche besoin, relances) n'y figuraient pas, et ceux
// écrits depuis la messagerie personnelle encore moins : pour savoir ce que la
// personne avait reçu, il fallait ouvrir le journal des e-mails et chercher son
// adresse. Tout se lit maintenant au même endroit, dans l'ordre.

export type EvenementDemande = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  actor_user_id: string | null;
};

export type EmailJournal = {
  id: string;
  kind: string | null;
  subject: string | null;
  status: string;
  sent_at: string;
  provider_id: string | null;
  opened_at: string | null;
  open_count: number | null;
  bounced_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type Suivi = { statut: 'envoye' | 'ouvert' | 'echec' | 'rejete'; ouvertLe: string | null; ouvertures: number };

export type ElementFil =
  | { type: 'evenement'; quand: string; evenement: EvenementDemande; suivi: Suivi | null }
  | { type: 'email'; quand: string; email: EmailJournal; suivi: Suivi };

export function suiviDe(e: EmailJournal): Suivi {
  if (e.status === 'failed') return { statut: 'echec', ouvertLe: null, ouvertures: 0 };
  if (e.bounced_at) return { statut: 'rejete', ouvertLe: null, ouvertures: 0 };
  if (e.opened_at) return { statut: 'ouvert', ouvertLe: e.opened_at, ouvertures: e.open_count ?? 1 };
  return { statut: 'envoye', ouvertLe: null, ouvertures: 0 };
}

/**
 * Fusionne notes et e-mails, du plus récent au plus ancien.
 *
 * Un e-mail écrit depuis la fiche a DEUX traces : l'événement, qui garde le
 * texte, et la ligne du journal, qui sait s'il a été ouvert. On n'en montre
 * qu'une — l'événement, enrichi du suivi —, sinon chaque message apparaîtrait
 * deux fois.
 */
export function filDesEchanges(evenements: readonly EvenementDemande[], emails: readonly EmailJournal[], prospectId: string): ElementFil[] {
  const parProvider = new Map(emails.filter((e) => e.provider_id).map((e) => [e.provider_id as string, e]));
  const couverts = new Set<string>();

  const items: ElementFil[] = evenements.map((ev) => {
    const pid = typeof ev.payload?.provider_id === 'string' ? ev.payload.provider_id : null;
    const email = pid ? parProvider.get(pid) : undefined;
    if (email) couverts.add(email.id);
    return { type: 'evenement', quand: ev.occurred_at, evenement: ev, suivi: email ? suiviDe(email) : null };
  });

  for (const e of emails) {
    if (couverts.has(e.id)) continue;
    // Écrit depuis cette fiche mais sans événement retrouvé (inscription
    // échouée) : on le montre quand même — mieux vaut l'objet que rien.
    if (e.metadata?.prospect_id && e.metadata.prospect_id !== prospectId) continue;
    items.push({ type: 'email', quand: e.sent_at, email: e, suivi: suiviDe(e) });
  }

  return items.sort((a, b) => b.quand.localeCompare(a.quand));
}
