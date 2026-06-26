import 'server-only';
import {
  learners,
  dossiers,
  formations,
  trainers,
  sessionsByDossier,
  modulesByDossier,
} from '@/shared/mock/data';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type ApprenantContext = {
  isReal: boolean;
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
    formation: { id: string; title: string };
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

  // Voie nominale : JWT valide → DB
  const verified = await verifyApprenantToken(token);
  if (verified.ok) {
    const sb = supabaseServer();
    const [dash, comp] = await Promise.all([
      sb.rpc('get_apprenant_dashboard' as never, { p_learner_id: verified.value.learnerId } as never),
      sb.rpc('get_learner_complaints' as never, { p_learner_id: verified.value.learnerId } as never),
    ]);
    if (!dash.error && dash.data) {
      const d = dash.data as unknown as RealDashboard;
      if (d.learner && d.dossier) {
        const complaintsArr = (comp.data ?? []) as unknown as RealComplaint[];
        return {
          isReal: true,
          learner: {
            id: d.learner.id,
            firstName: d.learner.first_name,
            lastName: d.learner.last_name,
            email: d.learner.email,
          },
          dossier: {
            id: d.dossier.id,
            reference: d.dossier.reference,
            formationId: d.dossier.formation.id,
            modality: d.dossier.modality,
            startDate: d.dossier.start_date,
            endDate: d.dossier.end_date,
            totalHours: d.dossier.total_hours,
            status: d.dossier.status,
          },
          formation: { id: d.dossier.formation.id, title: d.dossier.formation.title },
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

  // Fallback mock — tous les tokens >= 3 chars mappent à Alice
  const learner = learners.find((l) => l.id === 'l-1');
  if (!learner) return null;
  const dossier = dossiers.find((d) => d.learnerId === learner.id);
  if (!dossier) return null;
  const formation = formations.find((f) => f.id === dossier.formationId) ?? null;
  const trainer = trainers.find((t) => dossier.trainerIds.includes(t.id)) ?? null;

  return {
    isReal: false,
    learner: { id: learner.id, firstName: learner.firstName, lastName: learner.lastName, email: learner.email },
    dossier: {
      id: dossier.id,
      reference: dossier.reference,
      formationId: dossier.formationId,
      modality: dossier.modality,
      startDate: dossier.startDate,
      endDate: dossier.endDate,
      totalHours: dossier.totalHours,
      status: dossier.status,
    },
    formation: formation ? { id: formation.id, title: formation.title } : null,
    trainer: trainer ? { firstName: trainer.firstName, lastName: trainer.lastName, email: trainer.email } : null,
    sessions: sessionsByDossier[dossier.id] ?? [],
    modules: modulesByDossier[dossier.id] ?? [],
    complaints: [],
  };
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
