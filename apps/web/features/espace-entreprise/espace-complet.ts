import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { libelleEnvoi } from '@/features/emails/journal';
import { chargerEspaceEntreprise, facturesDuReferent, type DocumentEntreprise, type EspaceEntreprise, type FactureEntreprise } from './load';
import { aUneAdresse, heuresApprenant, trierActions, type Action, type Feuille } from './espace-calculs';

/**
 * Tout l'espace du référent d'un client (demande d'Ismael, 07/10/2026) : ses
 * actions requises, le planning de ses apprenants, chacun avec ses heures, ses
 * émargements et ses documents, ses devis et factures, et ses échanges avec
 * l'organisme. Lecture en service role : le contact et l'organisme viennent
 * du jeton vérifié par l'appelant, jamais de l'URL.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type SeanceEspace = {
  readonly id: string;
  readonly debut: string;
  readonly fin: string;
  readonly dureeHeures: number;
  readonly formation: string;
  readonly groupe: string | null;
  readonly modalite: string;
  readonly lieu: string | null;
  readonly visio: string | null;
  readonly formateurs: readonly string[];
  readonly participants: readonly string[];
  readonly passee: boolean;
};

export type EmargementEspace = {
  readonly sessionId: string;
  readonly debut: string;
  readonly demiJournee: string;
  readonly statut: string | null;
  readonly signeLe: string | null;
};

export type ApprenantEspace = {
  readonly id: string;
  readonly nom: string;
  readonly email: string | null;
  readonly joignable: boolean;
  readonly dossierId: string;
  readonly dossierReference: string;
  readonly formation: string | null;
  readonly heures: ReturnType<typeof heuresApprenant>;
  readonly prochaineSeance: string | null;
  readonly emargements: readonly EmargementEspace[];
  readonly documents: readonly DocumentEntreprise[];
};

export type DevisEspace = {
  readonly id: string;
  readonly reference: string;
  readonly objet: string | null;
  readonly statut: string;
  readonly totalCents: number;
  readonly emisLe: string | null;
  readonly validite: string | null;
  readonly aUnPdf: boolean;
};

export type EchangeEspace = {
  readonly id: string;
  readonly date: string;
  /** `recu` : envoyé par l'organisme au référent ; `envoye` : écrit par le référent. */
  readonly sens: 'recu' | 'envoye';
  readonly titre: string;
  readonly texte: string | null;
  readonly auteur: string;
};

export type PrixConvenu = { readonly dossierId: string; readonly reference: string; readonly formation: string | null; readonly montantHtCents: number };

export type EspaceComplet = EspaceEntreprise & {
  readonly referentEmail: string | null;
  /** Le prix fixé sur chaque dossier : connu avant tout devis ou toute facture. */
  readonly prix: readonly PrixConvenu[];
  readonly seances: readonly SeanceEspace[];
  readonly apprenants: readonly ApprenantEspace[];
  readonly factures: readonly FactureEntreprise[];
  readonly devis: readonly DevisEspace[];
  readonly echanges: readonly EchangeEspace[];
  readonly actions: readonly Action[];
};

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function seancesDesDossiers(admin: Admin, dossierIds: readonly string[]) {
  if (dossierIds.length === 0) return { seances: [], dossiersDe: new Map<string, string[]>() };
  const [{ data: directes, error: e1 }, { data: liens, error: e2 }] = await Promise.all([
    admin.schema('app').from('sessions').select('id, dossier_id').in('dossier_id', [...dossierIds]).neq('status', 'cancelled'),
    admin.schema('app').from('session_dossiers').select('session_id, dossier_id').in('dossier_id', [...dossierIds]),
  ]);
  exigerLecture('séances de l’espace entreprise', e1 ?? e2);
  const dossiersDe = new Map<string, string[]>();
  const ajouter = (s: string, d: string) => dossiersDe.set(s, [...new Set([...(dossiersDe.get(s) ?? []), d])]);
  for (const r of (directes ?? []) as Array<{ id: string; dossier_id: string }>) ajouter(r.id, r.dossier_id);
  for (const r of (liens ?? []) as Array<{ session_id: string; dossier_id: string }>) ajouter(r.session_id, r.dossier_id);
  const ids = [...dossiersDe.keys()];
  if (ids.length === 0) return { seances: [], dossiersDe };
  const { data, error } = await admin
    .schema('app')
    .from('sessions')
    .select('id, title, starts_at, ends_at, duration_hours, modality, location, remote_url, zoom_join_url, formation_id, groupe_id, status')
    .in('id', ids)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true });
  exigerLecture('séances de l’espace entreprise', error);
  return {
    seances: (data ?? []) as unknown as Array<{
      id: string;
      title: string | null;
      starts_at: string;
      ends_at: string;
      duration_hours: number | null;
      modality: string;
      location: string | null;
      remote_url: string | null;
      zoom_join_url: string | null;
      formation_id: string | null;
      groupe_id: string | null;
    }>,
    dossiersDe,
  };
}

export async function chargerEspaceComplet(contactId: string, organizationId: string, token: string): Promise<EspaceComplet | null> {
  const admin = supabaseAdmin() as unknown as Admin;
  const [base, factures, { data: contactRow }] = await Promise.all([
    chargerEspaceEntreprise(contactId, organizationId),
    facturesDuReferent(contactId, organizationId),
    admin.schema('app').from('contacts').select('email, company_id').eq('id', contactId).maybeSingle(),
  ]);
  if (!base) return null;
  const contact = contactRow as { email: string | null; company_id: string | null } | null;
  const referentEmail = contact?.email?.trim().toLowerCase() || null;
  const dossierIds = base.dossiers.map((d) => d.id);
  const dossierDe = new Map(base.dossiers.map((d) => [d.id, d]));
  const maintenant = Date.now();

  // ── Séances ──
  const { seances: brutes, dossiersDe } = await seancesDesDossiers(admin, dossierIds);
  const seanceIds = brutes.map((s) => s.id);
  const groupeIds = [...new Set(brutes.map((s) => s.groupe_id).filter((g): g is string => Boolean(g)))];
  const formationIds = [...new Set(brutes.map((s) => s.formation_id).filter((f): f is string => Boolean(f)))];

  // ── Apprenants de ces dossiers (le groupe s'il existe, le titulaire sinon) ──
  const apprenantsParDossier = new Map<string, string[]>();
  await Promise.all(
    dossierIds.map(async (id) => {
      const { data } = await admin.schema('app').rpc('dossier_apprenants' as never, { p_dossier_id: id } as never);
      apprenantsParDossier.set(id, [...new Set(((data ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id))]);
    }),
  );
  const learnerIds = [...new Set([...apprenantsParDossier.values()].flat())];

  const [
    { data: trainers },
    { data: groupes },
    { data: formations },
    { data: participants },
    { data: feuillesRows },
    { data: learnersRows },
    { data: membres },
  ] = await Promise.all([
    seanceIds.length
      ? admin.schema('app').from('session_trainers').select('session_id, trainer:trainers(first_name, last_name)').in('session_id', seanceIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    groupeIds.length ? admin.schema('app').from('dossier_groupes').select('id, nom').in('id', groupeIds) : Promise.resolve({ data: [] }),
    formationIds.length ? admin.schema('app').from('formations').select('id, title').in('id', formationIds) : Promise.resolve({ data: [] }),
    seanceIds.length
      ? admin.schema('app').from('session_participants').select('session_id, learner_id, source').in('session_id', seanceIds).eq('participant_kind', 'learner')
      : Promise.resolve({ data: [] }),
    seanceIds.length ? admin.schema('app').from('attendance_sheets').select('id, session_id, half_day').in('session_id', seanceIds) : Promise.resolve({ data: [] }),
    learnerIds.length ? admin.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds) : Promise.resolve({ data: [] }),
    groupeIds.length ? admin.schema('app').from('dossier_groupe_membres').select('groupe_id, learner_id').in('groupe_id', groupeIds) : Promise.resolve({ data: [] }),
  ]);

  const nomGroupe = new Map(((groupes ?? []) as Array<{ id: string; nom: string }>).map((g) => [g.id, g.nom]));
  const titreFormation = new Map(((formations ?? []) as Array<{ id: string; title: string }>).map((f) => [f.id, f.title]));
  const { data: duDossier } = dossierIds.length
    ? await admin.schema('app').from('dossier_trainers').select('dossier_id, trainer:trainers(first_name, last_name)').in('dossier_id', dossierIds)
    : { data: [] };
  const formateursDuDossier = new Map<string, string[]>();
  for (const t of (duDossier ?? []) as unknown as Array<{ dossier_id: string; trainer: { first_name: string | null; last_name: string | null } | null }>) {
    const tr = un(t.trainer);
    const nom = `${tr?.first_name ?? ''} ${tr?.last_name ?? ''}`.trim();
    if (nom) formateursDuDossier.set(t.dossier_id, [...(formateursDuDossier.get(t.dossier_id) ?? []), nom]);
  }
  const formateursDe = new Map<string, string[]>();
  for (const t of (trainers ?? []) as unknown as Array<{ session_id: string; trainer: { first_name: string | null; last_name: string | null } | null }>) {
    const tr = un(t.trainer);
    const nom = `${tr?.first_name ?? ''} ${tr?.last_name ?? ''}`.trim();
    if (nom) formateursDe.set(t.session_id, [...(formateursDe.get(t.session_id) ?? []), nom]);
  }
  const personnes = new Map(
    ((learnersRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((l) => [
      l.id,
      { nom: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Apprenant', email: l.email },
    ]),
  );
  const groupesDe = new Map<string, string[]>();
  for (const m of (membres ?? []) as Array<{ groupe_id: string; learner_id: string }>) {
    groupesDe.set(m.learner_id, [...(groupesDe.get(m.learner_id) ?? []), m.groupe_id]);
  }
  // Les participants inscrits à chaque séance, parmi les apprenants de ce client.
  const inscritsDe = new Map<string, Set<string>>();
  for (const p of (participants ?? []) as Array<{ session_id: string; learner_id: string | null; source: string | null }>) {
    if (!p.learner_id || p.source === 'manual_remove' || !personnes.has(p.learner_id)) continue;
    inscritsDe.set(p.session_id, (inscritsDe.get(p.session_id) ?? new Set()).add(p.learner_id));
  }
  // Attendu à une séance : inscrit, ou — sans liste d'inscrits — membre de son dossier et de son groupe.
  const attendu = (learnerId: string, s: (typeof brutes)[number]): boolean => {
    const inscrits = inscritsDe.get(s.id);
    if (inscrits && inscrits.size > 0) return inscrits.has(learnerId);
    const sesDossiers = dossiersDe.get(s.id) ?? [];
    if (!sesDossiers.some((d) => (apprenantsParDossier.get(d) ?? []).includes(learnerId))) return false;
    return !s.groupe_id || (groupesDe.get(learnerId) ?? []).includes(s.groupe_id);
  };

  const seances: SeanceEspace[] = brutes.map((s) => {
    const dossier = dossierDe.get((dossiersDe.get(s.id) ?? [])[0] ?? '');
    return {
      id: s.id,
      debut: s.starts_at,
      fin: s.ends_at,
      dureeHeures: Number(s.duration_hours ?? 0),
      formation: (s.formation_id ? titreFormation.get(s.formation_id) : null) ?? dossier?.formation ?? s.title ?? 'Formation',
      groupe: s.groupe_id ? (nomGroupe.get(s.groupe_id) ?? 'Groupe') : null,
      modalite: s.modality,
      lieu: s.location,
      visio: s.modality === 'presentiel' ? null : (s.zoom_join_url ?? s.remote_url),
      // Le formateur de la séance, sinon celui de son dossier : on l'assigne
      // souvent au dossier sans le répéter sur chaque séance.
      formateurs: formateursDe.get(s.id) ?? [...new Set((dossiersDe.get(s.id) ?? []).flatMap((d) => formateursDuDossier.get(d) ?? []))],
      participants: learnerIds.filter((l) => attendu(l, s)).map((l) => personnes.get(l)?.nom ?? 'Apprenant').sort((a, b) => a.localeCompare(b, 'fr')),
      passee: new Date(s.ends_at).getTime() < maintenant,
    };
  });

  // ── Émargements ──
  const feuilles = ((feuillesRows ?? []) as Array<{ id: string; session_id: string; half_day: string }>).map(
    (f): Feuille => ({ sheetId: f.id, sessionId: f.session_id, demiJournee: f.half_day }),
  );
  const { data: signatures } = feuilles.length && learnerIds.length
    ? await admin
        .schema('app')
        .from('attendance_signatures')
        .select('attendance_sheet_id, learner_id, status, signed_at')
        .in('attendance_sheet_id', feuilles.map((f) => f.sheetId))
        .in('learner_id', learnerIds)
        .eq('participant_kind', 'learner')
    : { data: [] };
  const statutDe = new Map<string, { statut: string | null; signeLe: string | null }>();
  for (const s of (signatures ?? []) as Array<{ attendance_sheet_id: string; learner_id: string; status: string | null; signed_at: string | null }>) {
    statutDe.set(`${s.learner_id}|${s.attendance_sheet_id}`, { statut: s.status, signeLe: s.signed_at });
  }

  const ORDRE_DEMI: Record<string, number> = { morning: 0, full: 1, afternoon: 2, evening: 3 };
  const apprenants: ApprenantEspace[] = [];
  for (const [dossierId, ids] of apprenantsParDossier) {
    const dossier = dossierDe.get(dossierId);
    if (!dossier) continue;
    for (const learnerId of ids) {
      if (apprenants.some((a) => a.id === learnerId)) continue;
      const p = personnes.get(learnerId);
      if (!p) continue;
      const sesSeances = brutes.filter((s) => attendu(learnerId, s));
      const sesFeuilles = feuilles.filter((f) => sesSeances.some((s) => s.id === f.sessionId));
      const statuts = Object.fromEntries(sesFeuilles.map((f) => [f.sheetId, statutDe.get(`${learnerId}|${f.sheetId}`)?.statut ?? null]));
      const debutDe = new Map(sesSeances.map((s) => [s.id, s.starts_at]));
      const dossierUnique = ids.length === 1;
      apprenants.push({
        id: learnerId,
        nom: p.nom,
        email: p.email,
        joignable: aUneAdresse(p.email),
        dossierId,
        dossierReference: dossier.reference,
        formation: dossier.formation,
        heures: heuresApprenant({
          seances: sesSeances.map((s) => ({ id: s.id, dureeHeures: Number(s.duration_hours ?? 0), passee: new Date(s.ends_at).getTime() < maintenant })),
          feuilles: sesFeuilles,
          statuts,
        }),
        prochaineSeance: sesSeances.find((s) => new Date(s.ends_at).getTime() >= maintenant)?.starts_at ?? null,
        emargements: sesFeuilles
          .map((f) => ({
            sessionId: f.sessionId,
            debut: debutDe.get(f.sessionId) ?? '',
            demiJournee: f.demiJournee,
            statut: statutDe.get(`${learnerId}|${f.sheetId}`)?.statut ?? null,
            signeLe: statutDe.get(`${learnerId}|${f.sheetId}`)?.signeLe ?? null,
          }))
          .sort((a, b) => a.debut.localeCompare(b.debut) || (ORDRE_DEMI[a.demiJournee] ?? 9) - (ORDRE_DEMI[b.demiJournee] ?? 9)),
        // Un dossier d'un seul apprenant : ses documents sont les siens.
        documents: dossierUnique ? dossier.documents : [],
      });
    }
  }
  apprenants.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  // ── Prix convenus ──
  const { data: montants } = dossierIds.length
    ? await admin.schema('app').from('dossiers').select('id, total_amount_cents').in('id', dossierIds)
    : { data: [] };
  const prix: PrixConvenu[] = ((montants ?? []) as Array<{ id: string; total_amount_cents: number | null }>)
    .filter((m) => Number(m.total_amount_cents ?? 0) > 0)
    .map((m) => ({
      dossierId: m.id,
      reference: dossierDe.get(m.id)?.reference ?? '',
      formation: dossierDe.get(m.id)?.formation ?? null,
      montantHtCents: Number(m.total_amount_cents),
    }));

  // ── Devis ──
  const { data: devisRows } = contact?.company_id
    ? await admin
        .schema('app')
        .from('quotes')
        .select('id, reference, object, status, total_cents, issued_on, valid_until, document_id')
        .eq('organization_id', organizationId)
        .eq('company_id', contact.company_id)
        .neq('status', 'draft')
        .is('deleted_at', null)
        .order('issued_on', { ascending: false, nullsFirst: false })
    : { data: [] };
  const devis: DevisEspace[] = ((devisRows ?? []) as Array<{
    id: string;
    reference: string;
    object: string | null;
    status: string;
    total_cents: number | null;
    issued_on: string | null;
    valid_until: string | null;
    document_id: string | null;
  }>).map((q) => ({
    id: q.id,
    reference: q.reference,
    objet: q.object,
    statut: q.status,
    totalCents: Number(q.total_cents ?? 0),
    emisLe: q.issued_on,
    validite: q.valid_until,
    aUnPdf: Boolean(q.document_id),
  }));

  // ── Échanges : ce que l'organisme lui a envoyé, et ce qu'il a écrit ──
  const [{ data: courriels }, { data: messages }] = await Promise.all([
    referentEmail
      ? admin
          .schema('app')
          .from('email_log')
          .select('id, kind, subject, sent_at')
          .eq('organization_id', organizationId)
          .ilike('recipient', referentEmail)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] }),
    admin
      .schema('app')
      .from('espace_entreprise_messages' as never)
      .select('id, auteur, auteur_nom, body, created_at')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const echanges: EchangeEspace[] = [
    ...((courriels ?? []) as Array<{ id: string; kind: string | null; subject: string | null; sent_at: string }>).map((c) => ({
      id: `mail-${c.id}`,
      date: c.sent_at,
      sens: 'recu' as const,
      titre: c.subject ?? libelleEnvoi(c.kind),
      texte: null,
      auteur: base.organisme,
    })),
    ...((messages ?? []) as unknown as Array<{ id: string; auteur: string; auteur_nom: string; body: string; created_at: string }>).map((m) => ({
      id: `msg-${m.id}`,
      date: m.created_at,
      sens: m.auteur === 'entreprise' ? ('envoye' as const) : ('recu' as const),
      titre: m.auteur === 'entreprise' ? 'Votre message' : `Message de ${m.auteur_nom}`,
      texte: m.body,
      auteur: m.auteur_nom,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // ── Actions requises ──
  const actions: Action[] = [];
  const docsIds = base.dossiers.length
    ? ((await admin.schema('app').from('documents').select('id, title, dossier_id').in('dossier_id', dossierIds).is('deleted_at', null)).data ?? [])
    : [];
  const titreDoc = new Map((docsIds as Array<{ id: string; title: string }>).map((d) => [d.id, d.title]));
  if (titreDoc.size > 0) {
    const { data: aSigner } = await admin
      .schema('app')
      .from('document_signatures')
      .select('id, document_id, signer_kind, signer_email, request_expires_at, created_at')
      .in('document_id', [...titreDoc.keys()])
      .eq('status', 'pending');
    for (const s of (aSigner ?? []) as Array<{ id: string; document_id: string; signer_kind: string; signer_email: string | null; request_expires_at: string | null; created_at: string }>) {
      const pourLui = s.signer_kind === 'company_rep' || (referentEmail && s.signer_email?.trim().toLowerCase() === referentEmail);
      if (!pourLui) continue;
      const expire = s.request_expires_at && new Date(s.request_expires_at).getTime() < maintenant;
      actions.push({
        cle: `signer-${s.id}`,
        nature: 'signer',
        titre: `Signer : ${titreDoc.get(s.document_id) ?? 'document'}`,
        detail: expire ? 'Le lien de signature a expiré : demandez-en un nouveau à l’organisme.' : 'Votre signature est attendue.',
        lien: expire ? null : `/espace-entreprise/${token}/signer/${s.id}`,
        libelleLien: expire ? null : 'Signer',
        urgent: !expire,
      });
    }
  }
  const { data: questionnaires } = await admin
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, template:questionnaire_templates(title)')
    .eq('organization_id', organizationId)
    .eq('recipient_kind', 'company_rep' as never)
    .eq('recipient_contact_id' as never, contactId as never)
    .in('status', ['pending', 'in_progress']);
  for (const q of (questionnaires ?? []) as unknown as Array<{ id: string; template: { title: string | null } | Array<{ title: string | null }> | null }>) {
    actions.push({
      cle: `questionnaire-${q.id}`,
      nature: 'repondre',
      titre: `Répondre : ${un(q.template)?.title ?? 'questionnaire de satisfaction'}`,
      detail: 'Votre avis sur la formation de vos équipes — quelques minutes.',
      lien: `/espace-entreprise/${token}/questionnaire/${q.id}`,
      libelleLien: 'Répondre',
      urgent: false,
    });
  }
  for (const f of factures) {
    if (f.statut === 'payee' || f.resteCents <= 0) continue;
    actions.push({
      cle: `facture-${f.id}`,
      nature: 'regler',
      titre: `Régler la facture ${f.reference}`,
      detail: f.statut === 'en_retard' ? 'Échéance dépassée.' : f.echeance ? `Échéance le ${new Date(`${f.echeance}T12:00:00Z`).toLocaleDateString('fr-FR')}.` : 'À régler.',
      lien: `/api/espace-entreprise/${token}/facture/${f.id}`,
      libelleLien: 'Voir la facture',
      urgent: f.statut === 'en_retard',
    });
  }
  const sansAdresse = apprenants.filter((a) => !a.joignable && a.prochaineSeance);
  if (sansAdresse.length > 0) {
    actions.push({
      cle: 'transmettre-convocations',
      nature: 'transmettre',
      titre: `Transmettre leur convocation à ${sansAdresse.length} apprenant${sansAdresse.length > 1 ? 's' : ''}`,
      detail: `Sans adresse e-mail, ils ne la reçoivent pas eux-mêmes : ${sansAdresse.map((a) => a.nom).join(', ')}.`,
      lien: null,
      libelleLien: null,
      urgent: false,
    });
  }

  return { ...base, referentEmail, prix, seances, apprenants, factures, devis, echanges, actions: trierActions(actions) };
}
