import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

// Charge le logo de l'organisme pour l'espace apprenant. L'apprenant n'est pas
// membre de l'org : on passe par le service role (bucket org_assets privé) et on
// renvoie une URL signée (1 h). Renvoie null si aucun logo.
async function loadOrgLogoSignedUrl(organizationId: string): Promise<string | null> {
  try {
    const admin = supabaseAdmin();
    const { data: orgRow } = await admin
      .schema('app')
      .from('organizations')
      .select('logo_path')
      .eq('id', organizationId)
      .maybeSingle();
    const path = (orgRow as { logo_path?: string | null } | null)?.logo_path ?? null;
    if (!path) return null;
    const { data: signed } = await admin.storage.from('org_assets').createSignedUrl(path, 3600);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export type ApprenantContext = {
  isReal: boolean;
  organization: { id: string; name: string; logoUrl: string | null };
  learner: { id: string; firstName: string; lastName: string; email: string };
  dossier: {
    id: string;
    reference: string;
    formationId: string;
    modality: string;
    startDate: string;
    endDate: string;
    totalHours: number;
    status: string;
  };
  formation: { id: string; title: string } | null;
  trainer: { firstName: string; lastName: string; email: string } | null;
  sessions: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
    location?: string | null;
    modality?: string | null;
    remoteUrl?: string | null;
  }>;
  modules: Array<{
    id: string;
    title: string;
    position: number;
    durationHours: number;
  }>;
  complaints: Array<{
    id: string;
    reference: string;
    subject: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    category: string;
    createdAt: string;
    resolvedAt: string | null;
    resolution: string | null;
  }>;
};

type RealDashboard = {
  learner: { id: string; first_name: string; last_name: string; email: string };
  organization: { id: string; name: string };
  dossier: {
    id: string;
    reference: string;
    status: string;
    modality: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    formation: { id: string; title: string } | null;
  };
  sessions: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    location: string | null;
    modality: string | null;
    remote_url: string | null;
  }>;
  modules: Array<{ id: string; title: string; position: number; duration_hours: number }>;
  trainer: { first_name: string; last_name: string; email: string } | null;
};

type RealComplaint = {
  id: string;
  reference: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  category: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
};

export async function resolveApprenantContext(token: string): Promise<ApprenantContext | null> {
  if (!token || token.length < 3) return null;

  // JWT valide → DB. Aucune donnée fictive : un lien invalide/expiré ou un
  // apprenant introuvable renvoie null (page "lien invalide"), jamais un
  // apprenant de démonstration.
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) {
    console.warn('[espace-apprenant] token invalide/expiré:', verified.error);
    return null;
  }
  {
    const sb = supabaseServer();
    // Les RPC vivent dans le schéma `app` ; le client par défaut cible `public`.
    // Sans `.schema('app')`, l'appel échoue → on retombait sur le mock (Alice).
    const [dash, comp] = await Promise.all([
      sb.schema('app').rpc('get_apprenant_dashboard' as never, { p_learner_id: verified.value.learnerId } as never),
      sb.schema('app').rpc('get_learner_complaints' as never, { p_learner_id: verified.value.learnerId } as never),
    ]);
    if (dash.error) {
      console.error('[espace-apprenant] RPC get_apprenant_dashboard a échoué:', dash.error);
      return null;
    }
    if (dash.data) {
      const d = dash.data as unknown as RealDashboard;
      if (d.learner && d.dossier) {
        const complaintsArr = (comp.data ?? []) as unknown as RealComplaint[];
        const logoUrl = d.organization?.id ? await loadOrgLogoSignedUrl(d.organization.id) : null;
        return {
          isReal: true,
          organization: {
            id: d.organization?.id ?? '',
            name: d.organization?.name ?? 'Organisme de formation',
            logoUrl,
          },
          learner: {
            id: d.learner.id,
            firstName: d.learner.first_name,
            lastName: d.learner.last_name,
            email: d.learner.email,
          },
          dossier: {
            id: d.dossier.id,
            reference: d.dossier.reference,
            formationId: d.dossier.formation?.id ?? '',
            modality: d.dossier.modality,
            startDate: d.dossier.start_date,
            endDate: d.dossier.end_date,
            totalHours: d.dossier.total_hours,
            status: d.dossier.status,
          },
          formation: d.dossier.formation
            ? { id: d.dossier.formation.id, title: d.dossier.formation.title }
            : null,
          trainer: d.trainer
            ? { firstName: d.trainer.first_name, lastName: d.trainer.last_name, email: d.trainer.email }
            : null,
          sessions: d.sessions.map((s) => ({
            id: s.id,
            status: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'in_progress' : 'planned',
            startsAt: s.starts_at,
            endsAt: s.ends_at,
            location: s.location,
            modality: s.modality,
            remoteUrl: s.remote_url,
          })),
          modules: d.modules.map((m) => ({
            id: m.id,
            title: m.title,
            position: m.position,
            durationHours: m.duration_hours,
          })),
          complaints: complaintsArr.map((c) => ({
            id: c.id,
            reference: c.reference,
            subject: c.subject,
            description: c.description,
            status: c.status,
            category: c.category,
            createdAt: c.created_at,
            resolvedAt: c.resolved_at,
            resolution: c.resolution,
          })),
        };
      }
    }
  }

  // Token valide mais apprenant/dossier introuvable en base (lien généré sur une
  // autre base, apprenant supprimé…). JAMAIS de fallback vers un apprenant
  // fictif : montrer les données d'un tiers (ancien mock « Alice ») serait une
  // fuite RGPD et rendrait l'espace non personnalisé.
  console.warn('[espace-apprenant] apprenant ou dossier introuvable pour ce lien');
  return null;
}

export const MODALITY_LABEL: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

export function formatSessionDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatSessionTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
