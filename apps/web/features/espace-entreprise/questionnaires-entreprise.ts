import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { envoiActif } from '@/features/emails/programmation-store';
import { interlocuteurDuModele } from '@/features/questionnaire/cartographie';
import { jourEnvoi, jourParis } from '@/features/questionnaire/programmation-seance';
import { minuitParis } from '@/shared/lib/heure-paris';
import { ensureCompanySatisfactionTemplate } from '@/features/questionnaire/satisfaction-entreprise';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/**
 * Les questionnaires de l'entreprise, dans son espace (demande d'Ismael,
 * 2026-10-07) : ceux qu'on lui a déjà adressés, et ceux qui viendront — « à
 * venir à partir du… » —, débloqués le jour dit sans attendre l'e-mail.
 * Prévus : la satisfaction entreprise (24 h après la dernière séance du
 * dossier, comme son envoi automatique) et les questionnaires cochés sur une
 * séance pour l'entreprise (au jour programmé).
 */

export type QuestionnaireEspace = {
  readonly cle: string;
  readonly titre: string;
  readonly formation: string | null;
  readonly statut: 'a_venir' | 'disponible' | 'repondu';
  /** À venir : à partir de quand (ISO) ; répondu : quand. */
  readonly date: string | null;
  readonly lien: string | null;
};

/** La satisfaction entreprise s'ouvre un jour après la dernière séance du dossier. */
export const DELAI_SATISFACTION_ENTREPRISE_MS = 24 * 3600_000;

type Entree = {
  contactId: string;
  organizationId: string;
  token: string;
  dossiers: ReadonlyArray<{ id: string; formation: string | null }>;
  seances: ReadonlyArray<{ id: string; debut: string; fin: string; dossierIds: readonly string[] }>;
  maintenant?: Date;
};

export const lienOuverture = (token: string, dossierId: string, templateId: string) =>
  `/espace-entreprise/${token}/questionnaire/ouvrir?dossier=${dossierId}&modele=${templateId}`;

export async function questionnairesDeLEntreprise(admin: Admin, e: Entree): Promise<QuestionnaireEspace[]> {
  const maintenant = e.maintenant ?? new Date();
  const formationDe = new Map(e.dossiers.map((d) => [d.id, d.formation]));
  const dossierIds = e.dossiers.map((d) => d.id);
  const sortie: QuestionnaireEspace[] = [];

  // ── Déjà adressés au référent ──
  const { data: a } = await admin
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, updated_at, dossier_id, template_id, template:questionnaire_templates(title)')
    .eq('organization_id', e.organizationId)
    .eq('recipient_kind', 'company_rep')
    .eq('recipient_contact_id', e.contactId)
    .neq('status', 'expired');
  const assignations = (a ?? []) as unknown as Array<{
    id: string;
    status: string;
    updated_at: string;
    dossier_id: string | null;
    template_id: string;
    template: { title: string | null } | Array<{ title: string | null }> | null;
  }>;
  const dejaLa = new Set(assignations.map((x) => `${x.template_id}:${x.dossier_id ?? ''}`));
  for (const x of assignations) {
    const t = Array.isArray(x.template) ? x.template[0] : x.template;
    const repondu = x.status === 'completed';
    sortie.push({
      cle: `assignation-${x.id}`,
      titre: t?.title ?? 'Questionnaire',
      formation: x.dossier_id ? (formationDe.get(x.dossier_id) ?? null) : null,
      statut: repondu ? 'repondu' : 'disponible',
      date: repondu ? x.updated_at : null,
      lien: repondu ? null : `/espace-entreprise/${e.token}/questionnaire/${x.id}`,
    });
  }

  const prevus = new Map<string, QuestionnaireEspace>();
  const prevoir = (templateId: string, titre: string, dossierId: string, ouverture: Date) => {
    const cle = `${templateId}:${dossierId}`;
    if (dejaLa.has(cle)) return;
    const existant = prevus.get(cle);
    if (existant?.date && new Date(existant.date) <= ouverture) return;
    const ouvert = ouverture.getTime() <= maintenant.getTime();
    prevus.set(cle, {
      cle: `prevu-${cle}`,
      titre,
      formation: formationDe.get(dossierId) ?? null,
      statut: ouvert ? 'disponible' : 'a_venir',
      date: ouverture.toISOString(),
      lien: ouvert ? lienOuverture(e.token, dossierId, templateId) : null,
    });
  };

  // ── Satisfaction entreprise, un jour après la dernière séance de chaque dossier ──
  if (dossierIds.length && (await envoiActif(e.organizationId, 'satisfaction_entreprise'))) {
    const modele = await ensureCompanySatisfactionTemplate(admin as never);
    const { data: avecEntreprise } = await admin.schema('app').from('dossiers').select('id').in('id', dossierIds).not('company_id', 'is', null);
    for (const { id } of (avecEntreprise ?? []) as Array<{ id: string }>) {
      const fins = e.seances.filter((s) => s.dossierIds.includes(id)).map((s) => new Date(s.fin).getTime());
      if (fins.length === 0) continue;
      prevoir(modele, 'Votre retour sur la formation', id, new Date(Math.max(...fins) + DELAI_SATISFACTION_ENTREPRISE_MS));
    }
  }

  // ── Questionnaires cochés sur une séance, pour l'entreprise ──
  const seanceIds = e.seances.map((s) => s.id);
  if (seanceIds.length) {
    const { data: p } = await admin
      .schema('app')
      .from('session_questionnaires')
      .select('session_id, template_id, ancre, decalage_jours, enabled')
      .in('session_id', seanceIds)
      .eq('enabled', true);
    const programmes = (p ?? []) as Array<{ session_id: string; template_id: string; ancre: 'debut' | 'fin'; decalage_jours: number }>;
    const tplIds = [...new Set(programmes.map((x) => x.template_id))];
    const { data: t } = tplIds.length
      ? await admin.schema('app').from('questionnaire_templates').select('id, title, kind, code, audience').in('id', tplIds).is('deleted_at', null)
      : { data: [] };
    const pourEntreprise = new Map(
      ((t ?? []) as Array<{ id: string; title: string; kind: string; code: string | null; audience: string | null }>)
        .filter((m) => interlocuteurDuModele(m) === 'entreprise')
        .map((m) => [m.id, m.title]),
    );
    for (const x of programmes) {
      const titre = pourEntreprise.get(x.template_id);
      const seance = e.seances.find((s) => s.id === x.session_id);
      if (!titre || !seance) continue;
      // Le jour programmé, dès minuit (heure de Paris) : comme son envoi.
      const jour = jourEnvoi({ startsAt: seance.debut, endsAt: seance.fin }, { ancre: x.ancre, decalage: x.decalage_jours });
      // « Le jour de la fin » : pas avant que la séance soit terminée.
      const ouverture = x.ancre === 'fin' && x.decalage_jours === 0 ? new Date(seance.fin) : minuitParis(jour);
      for (const d of seance.dossierIds) prevoir(x.template_id, titre, d, ouverture);
    }
  }

  const ordre = { disponible: 0, a_venir: 1, repondu: 2 } as const;
  return [...sortie, ...prevus.values()].sort(
    (x, y) => ordre[x.statut] - ordre[y.statut] || (x.date ?? '').localeCompare(y.date ?? '') * (x.statut === 'repondu' ? -1 : 1),
  );
}

/** Le jour de Paris d'une date, pour l'afficher sans surprise de fuseau. */
export const jourDe = (iso: string) => jourParis(iso);
