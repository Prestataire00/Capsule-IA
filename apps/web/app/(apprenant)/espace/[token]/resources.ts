import 'server-only';
import { headers } from 'next/headers';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export type ApprenantDocument = {
  id: string;
  kind: string;
  title: string;
  displayStatus: 'signed' | 'available' | 'pending';
  generatedAt: string | null;
  fileSizeBytes: number | null;
};

export type ApprenantModuleSupports = {
  moduleId: string;
  moduleTitle: string;
  modulePosition: number;
  resources: Array<{ id: string; title: string; mimeType: string; fileSizeBytes: number | null }>;
};

export type ApprenantResources = {
  dossierId: string;
  documents: ApprenantDocument[];
  supports: ApprenantModuleSupports[];
  assiduite: { heuresPlanifiees: number; heuresSignees: number };
};

type RpcShape = {
  dossier_id: string;
  documents: Array<{
    id: string;
    kind: string;
    title: string;
    display_status: ApprenantDocument['displayStatus'];
    generated_at: string | null;
    file_size_bytes: number | null;
  }>;
  supports: Array<{
    module_id: string;
    module_title: string;
    module_position: number;
    resources: Array<{ id: string; title: string; mime_type: string; file_size_bytes: number | null }>;
  }>;
  assiduite: { heures_planifiees: number; heures_signees: number };
};

export async function resolveApprenantResources(token: string): Promise<ApprenantResources | null> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return null;

  const sb = supabaseServer();
  const { data, error } = await sb.rpc(
    'get_apprenant_resources' as never,
    { p_learner_id: verified.value.learnerId } as never,
  );
  if (error || !data) return null;

  const d = data as unknown as RpcShape;
  return {
    dossierId: d.dossier_id,
    documents: d.documents.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      displayStatus: x.display_status,
      generatedAt: x.generated_at,
      fileSizeBytes: x.file_size_bytes,
    })),
    supports: d.supports.map((m) => ({
      moduleId: m.module_id,
      moduleTitle: m.module_title,
      modulePosition: m.module_position,
      resources: m.resources.map((r) => ({
        id: r.id,
        title: r.title,
        mimeType: r.mime_type,
        fileSizeBytes: r.file_size_bytes,
      })),
    })),
    assiduite: {
      heuresPlanifiees: d.assiduite.heures_planifiees,
      heuresSignees: d.assiduite.heures_signees,
    },
  };
}

/** IDs des ressources pédagogiques déjà consultées (vue/téléchargement) par l'apprenant. */
export async function loadConsultedResourceIds(token: string): Promise<Set<string>> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return new Set();

  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('resource_access_log' as never)
    .select('target_id')
    .eq('learner_id', verified.value.learnerId)
    .eq('target_kind', 'module_resource');
  const rows = (data ?? []) as unknown as { target_id: string }[];
  return new Set(rows.map((r) => r.target_id));
}

/** Journalise un accès apprenant. Écrit via service_role (bypass RLS, INSERT-only). */
export async function logResourceAccess(opts: {
  token: string;
  targetKind: 'document' | 'module_resource' | 'replay';
  targetId: string;
  action: 'view' | 'download';
}): Promise<void> {
  const verified = await verifyApprenantToken(opts.token);
  if (!verified.ok) return; // pas de log si token invalide ; l'appelant gère le 401

  const h = headers();
  const ipRaw = h.get('x-forwarded-for');
  const ip = ipRaw ? (ipRaw.split(',')[0]?.trim() ?? null) : null;
  const userAgent = h.get('user-agent');

  const admin = supabaseAdmin();
  try {
    await admin
      .schema('app')
      // resource_access_log absent des types générés (Docker down au moment de db:types)
      .from('resource_access_log' as never)
      .insert({
        organization_id: verified.value.organizationId,
        target_kind: opts.targetKind,
        target_id: opts.targetId,
        dossier_id: verified.value.dossierId,
        learner_id: verified.value.learnerId,
        actor_kind: 'learner_token',
        action: opts.action,
        ip,
        user_agent: userAgent,
      } as never);
  } catch {
    // audit best-effort : on ne bloque pas l'utilisateur si l'insert échoue
  }
}
