// ARCHETYPE: command — QR du questionnaire de satisfaction projeté en fin de séance.
import { notFound } from 'next/navigation';
import { accessibleSession } from '@/features/attendance/access';
import { loadSession } from '@/features/sessions/load-session';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { ProjecteurSatisfaction } from './projecteur.client';

export const dynamic = 'force-dynamic';

export default async function ProjectionSatisfactionPage({ params }: { params: { sessionId: string } }) {
  const acces = await accessibleSession(params.sessionId);
  if (!acces.ok) notFound();
  const loaded = await loadSession(supabaseAdmin(), params.sessionId);
  if (!loaded) notFound();
  return <ProjecteurSatisfaction sessionId={params.sessionId} titre={loaded.formation?.title ?? loaded.session.title ?? 'Formation'} />;
}
