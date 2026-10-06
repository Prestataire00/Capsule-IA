import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  KINDS_COURRIEL_QUESTIONNAIRE,
  estDestinataire,
  libelleQuestionnaire,
  trierEnvois,
  type Courriel,
  type EnvoiQuestionnaire,
} from './suivi-envois';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

type Ligne = {
  id: string;
  status: string;
  recipient_kind: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_learner_id: string | null;
  recipient_funder_id: string | null;
  template_id: string;
  created_at: string;
  due_at: string | null;
  reminders_sent: number | null;
  last_reminder_at: string | null;
  template: { kind: string | null; title: string | null } | null;
};

const nomComplet = (p: { first_name: string | null; last_name: string | null }): string =>
  `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();

/** Les questionnaires du dossier, tous destinataires confondus, et les e-mails qui les ont portés. */
export async function loadSuiviEnvois(
  sb: Client,
  dossierId: string,
): Promise<{ envois: EnvoiQuestionnaire[]; courriels: Courriel[] }> {
  const [{ data: lignes, error }, { data: mails, error: errMails }] = await Promise.all([
    sb
      .schema('app')
      .from('questionnaire_assignments')
      .select(
        'id, status, recipient_kind, recipient_name, recipient_email, recipient_learner_id, recipient_funder_id, template_id, created_at, due_at, reminders_sent, last_reminder_at, template:questionnaire_templates(kind, title)',
      )
      .eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('email_log')
      .select('id, kind, recipient, subject, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at')
      .eq('dossier_id', dossierId)
      .in('kind', [...KINDS_COURRIEL_QUESTIONNAIRE])
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(100),
  ]);
  if (error) throw new Error(`questionnaire_assignments: ${error.message}`);
  if (errMails) throw new Error(`email_log: ${errMails.message}`);

  const rows = ((lignes as unknown as Ligne[] | null) ?? []).filter((r) => estDestinataire(r.recipient_kind));
  const idsApprenants = [...new Set(rows.map((r) => r.recipient_learner_id).filter((x): x is string => !!x))];
  const idsFinanceurs = [...new Set(rows.map((r) => r.recipient_funder_id).filter((x): x is string => !!x))];
  const ids = rows.map((r) => r.id);

  const [{ data: apprenants }, { data: financeurs }, { data: reponses }] = await Promise.all([
    idsApprenants.length
      ? sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', idsApprenants)
      : Promise.resolve({ data: [] }),
    idsFinanceurs.length
      ? sb.schema('app').from('funders').select('id, name').in('id', idsFinanceurs)
      : Promise.resolve({ data: [] }),
    ids.length
      ? sb.schema('app').from('questionnaire_responses').select('assignment_id, submitted_at').in('assignment_id', ids)
      : Promise.resolve({ data: [] }),
  ]);
  const apprenant = new Map(
    ((apprenants as { id: string; first_name: string | null; last_name: string | null; email: string | null }[] | null) ?? []).map(
      (l) => [l.id, l],
    ),
  );
  const financeur = new Map(((financeurs as { id: string; name: string }[] | null) ?? []).map((f) => [f.id, f.name]));
  const reponduLe = new Map<string, string>();
  for (const r of (reponses as { assignment_id: string | null; submitted_at: string | null }[] | null) ?? []) {
    if (r.assignment_id && r.submitted_at) reponduLe.set(r.assignment_id, r.submitted_at);
  }

  const envois = rows.map((r): EnvoiQuestionnaire => {
    const l = r.recipient_learner_id ? apprenant.get(r.recipient_learner_id) : undefined;
    const nom =
      (l ? nomComplet(l) : '') ||
      r.recipient_name?.trim() ||
      (r.recipient_funder_id ? financeur.get(r.recipient_funder_id) : undefined) ||
      r.recipient_email ||
      '—';
    return {
      id: r.id,
      questionnaire: libelleQuestionnaire(r.template?.kind ?? null, r.template?.title ?? null),
      modeleId: r.template_id,
      destinataire: r.recipient_kind as EnvoiQuestionnaire['destinataire'],
      nom,
      email: r.recipient_email ?? l?.email ?? null,
      envoyeLe: r.created_at,
      relances: r.reminders_sent ?? 0,
      derniereRelance: r.last_reminder_at,
      echeance: r.due_at,
      status: r.status,
      reponduLe: reponduLe.get(r.id) ?? null,
    };
  });

  const courriels = (
    (mails as {
      id: string;
      kind: string | null;
      recipient: string;
      subject: string | null;
      status: string | null;
      sent_at: string | null;
      delivered_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      bounced_at: string | null;
    }[] | null) ?? []
  ).map(
    (m): Courriel => ({
      id: m.id,
      kind: m.kind,
      destinataire: m.recipient,
      sujet: m.subject,
      status: m.status,
      envoyeLe: m.sent_at,
      delivreLe: m.delivered_at,
      ouvertLe: m.opened_at,
      cliqueLe: m.clicked_at,
      rebondLe: m.bounced_at,
    }),
  );

  return { envois: trierEnvois(envois), courriels };
}
