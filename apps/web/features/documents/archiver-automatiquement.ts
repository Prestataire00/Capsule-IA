import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLearnerDocument, learnerDocumentUrl, type LearnerDocumentType } from './learner-documents';
import { persistGeneratedDocument } from './persist-document';

/**
 * Archivage automatique des documents d'un dossier, depuis les tâches
 * planifiées.
 *
 * Constat de la recette du 20/09/2026 : seul le certificat de réalisation
 * s'archivait tout seul. La convocation partait par e-mail sans qu'aucun PDF
 * ne soit conservé, et l'attestation de fin n'existait qu'au moment où
 * quelqu'un cliquait — c'est-à-dire jamais, le lien envoyé au stagiaire étant
 * réservé au personnel. Sans pièce archivée, l'organisme n'a aucune preuve
 * d'envoi à produire lors d'un audit Qualiopi.
 *
 * `sourceKey` rend l'opération idempotente : repasser sur la même séance
 * remplace la version courante au lieu d'empiler des doublons. Les documents
 * vivants (une convocation dont l'horaire change jusqu'au jour J) sont ainsi
 * remis à jour, en gardant leur historique de versions.
 *
 * Ne lève jamais : un archivage manqué ne doit pas empêcher un envoi. L'échec
 * est journalisé et remonté à l'appelant, qui le fera apparaître dans le
 * compte rendu du cron.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type ArchivageResultat =
  | { ok: true; documentId: string }
  | { ok: false; raison: string };

export async function archiverDocument(
  sb: Client,
  args: { type: LearnerDocumentType; dossierId: string; sessionId: string },
): Promise<ArchivageResultat> {
  try {
    const built = await buildLearnerDocument(sb, args);
    if (!built) return { ok: false, raison: 'document_non_constructible' };

    const persisted = await persistGeneratedDocument(sb as never, {
      organizationId: built.organizationId,
      dossierId: args.dossierId,
      kind: built.kind,
      title: built.title,
      bytes: built.bytes,
      generationInput: built.generationInput,
      sourceKey: `${args.type}:${args.dossierId}:${args.sessionId}`,
      sourceUrl: learnerDocumentUrl(args.type, args.dossierId, args.sessionId),
      metadata: { session_id: args.sessionId, archive_automatique: true },
    });
    return { ok: true, documentId: persisted.documentId };
  } catch (e) {
    const raison = e instanceof Error ? e.message : String(e);
    console.error('[archivage] document non archivé', args.type, args.dossierId, raison);
    return { ok: false, raison };
  }
}
