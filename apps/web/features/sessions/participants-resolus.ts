import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { stagiairesDeLaSeance } from '@/features/questionnaire/stagiaires-de-seance';
import type { DirectParticipant, SessionLearner } from './load-session';

/**
 * Les participants d'une séance avec leur dossier. Le chargement de la séance
 * ne connaît que le titulaire de chaque dossier : les autres apprenants d'un
 * dossier de groupe manquaient, ou passaient pour « inscrits sans dossier » —
 * leurs fiches besoin et questionnaires ne remontaient pas (constat du
 * 2026-10-08). Ici, chacun retrouve son dossier et son entreprise.
 */
export async function participantsResolus(
  sessionId: string,
  loaded: { learners: readonly SessionLearner[]; directLearners: readonly DirectParticipant[] },
): Promise<{ learners: SessionLearner[]; directLearners: DirectParticipant[] }> {
  const admin = supabaseAdmin();
  const resolus = await stagiairesDeLaSeance(admin as never, sessionId);
  const connus = new Set(loaded.learners.map((l) => l.id));
  const aAjouter = resolus.filter((r) => r.dossierId && !connus.has(r.id));
  const [{ data: dossiers }, { data: emails }] = aAjouter.length
    ? await Promise.all([
        admin.schema('app').from('dossiers').select('id, reference, company_id, company:companies(name)').in('id', [...new Set(aAjouter.map((r) => r.dossierId as string))]),
        admin.schema('app').from('learners').select('id, email').in('id', aAjouter.map((r) => r.id)),
      ])
    : [{ data: [] }, { data: [] }];
  const infoDossier = new Map(
    ((dossiers ?? []) as unknown as Array<{ id: string; reference: string; company_id: string | null; company: { name: string | null } | Array<{ name: string | null }> | null }>).map((d) => [
      d.id,
      { reference: d.reference, companyId: d.company_id, companyName: (Array.isArray(d.company) ? d.company[0]?.name : d.company?.name) ?? null },
    ]),
  );
  const emailDe = new Map(((emails ?? []) as Array<{ id: string; email: string | null }>).map((e) => [e.id, e.email]));
  const learners: SessionLearner[] = [
    ...loaded.learners,
    ...aAjouter.map((r) => {
      const d = infoDossier.get(r.dossierId as string);
      return {
        id: r.id,
        first_name: r.prenom,
        last_name: r.nom,
        email: emailDe.get(r.id) ?? '',
        dossierId: r.dossierId as string,
        dossierReference: d?.reference ?? '',
        companyId: d?.companyId ?? null,
        companyName: d?.companyName ?? null,
      };
    }),
  ];
  const avecDossier = new Set(learners.map((l) => l.id));
  return { learners, directLearners: loaded.directLearners.filter((l) => !avecDossier.has(l.id)) };
}
