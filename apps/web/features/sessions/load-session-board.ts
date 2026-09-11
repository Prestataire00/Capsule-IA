import 'server-only';
import type { LoadedSession } from './load-session';
import type { BoardFacts } from './session-board';

/**
 * Faits du tableau de bord d'une session, comptés par apprenant (un dossier
 * par apprenant). Lecture sous RLS, avec le client de la page. Une source
 * illisible est journalisée et compte pour zéro : le tableau reste affiché.
 */

type Res = { data: unknown; error: { message: string } | null };

async function lignes<T>(nom: string, requete: PromiseLike<Res> | null): Promise<T[]> {
  if (!requete) return [];
  const { data, error } = await requete;
  if (error) {
    console.error(`[session-board] ${nom} illisible — compté à zéro : ${error.message}`);
    return [];
  }
  return (data ?? []) as T[];
}

type ParDossier = { dossier_id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadBoardFacts(sb: any, loaded: LoadedSession): Promise<BoardFacts> {
  const { session, learners, sheets } = loaded;
  const ids = [...new Set(learners.map((l) => l.dossierId))];
  // Sans apprenant, rien à compter : on n'interroge pas la base avec une liste vide.
  const si = (q: () => PromiseLike<Res>): PromiseLike<Res> | null => (ids.length ? q() : null);

  const [emails, docs, questionnaires, factures, dossiers, intervenants, formateursDossier] = await Promise.all([
    lignes<ParDossier & { kind: string }>(
      'e-mails',
      si(() =>
        sb.schema('app').from('email_log').select('dossier_id, kind').in('dossier_id', ids).eq('status', 'sent').in('kind', ['acces_apprenant', 'convocation_j7']),
      ),
    ),
    lignes<ParDossier & { kind: string }>(
      'documents',
      si(() =>
        sb
          .schema('app')
          .from('documents')
          .select('dossier_id, kind')
          .in('dossier_id', ids)
          .in('kind', ['convention', 'convocation', 'attestation_fin', 'certificat_realisation'])
          .is('deleted_at', null),
      ),
    ),
    lignes<ParDossier & { template: { kind: string } | { kind: string }[] | null }>(
      'questionnaires',
      si(() =>
        sb.schema('app').from('questionnaire_assignments').select('dossier_id, template:questionnaire_templates(kind)').in('dossier_id', ids).eq('status', 'completed'),
      ),
    ),
    lignes<ParDossier>(
      'factures',
      si(() => sb.schema('app').from('invoices').select('dossier_id').in('dossier_id', ids).neq('status', 'cancelled')),
    ),
    lignes<{ id: string; qualiopi_ready: boolean | null }>(
      'dossiers',
      si(() => sb.schema('app').from('dossiers').select('id, qualiopi_ready').in('id', ids)),
    ),
    lignes<{ trainer_id: string | null }>(
      'intervenants',
      sb.schema('app').from('session_participants').select('trainer_id').eq('session_id', session.id).eq('participant_kind', 'trainer'),
    ),
    lignes<ParDossier>(
      'formateurs des dossiers',
      si(() => sb.schema('app').from('dossier_trainers').select('dossier_id').in('dossier_id', ids)),
    ),
  ]);

  const dossiersOu = (...ensembles: { dossier_id: string }[][]) => new Set(ensembles.flat().map((r) => r.dossier_id)).size;
  const emailsDe = (kind: string) => emails.filter((e) => e.kind === kind);
  const docsDe = (...kinds: string[]) => docs.filter((d) => kinds.includes(d.kind));
  const qstDe = (...kinds: string[]) =>
    questionnaires.filter((q) => {
      const t = Array.isArray(q.template) ? q.template[0] : q.template;
      return t !== null && t !== undefined && kinds.includes(t.kind);
    });

  return {
    formationId: loaded.formation?.id ?? null,
    hasPlace: Boolean(session.location?.trim() || session.remote_url?.trim()),
    trainerAssigned: intervenants.some((p) => p.trainer_id) || formateursDossier.length > 0,
    learners: learners.length,
    conventions: dossiersOu(docsDe('convention')),
    convocations: dossiersOu(emailsDe('convocation_j7'), docsDe('convocation')),
    sheets: sheets.length,
    sheetsFinalized: sheets.filter((s) => s.status === 'finalized').length,
    access: dossiersOu(emailsDe('acces_apprenant')),
    positionnement: dossiersOu(qstDe('positionnement')),
    evaluation: dossiersOu(qstDe('evaluation_acquis')),
    satisfaction: dossiersOu(qstDe('satisfaction_chaud', 'satisfaction_froid')),
    attestations: dossiersOu(docsDe('attestation_fin', 'certificat_realisation')),
    invoiced: dossiersOu(factures),
    qualiopiReady: dossiers.filter((d) => d.qualiopi_ready).length,
  };
}
