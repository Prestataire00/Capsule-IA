// ARCHETYPE: command
import Link from 'next/link';
import { ArrowLeft, Video } from 'lucide-react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ZoomS2sForm, type ZoomStatus } from './zoom-form.client';

export const dynamic = 'force-dynamic';

export default async function ZoomIntegrationPage() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: member } = await sb
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) redirect('/parametres');

  const role = (member as { organization_id: string; role: string }).role;
  if (role !== 'owner' && role !== 'admin') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Accès réservé aux administrateurs de l&apos;organisation.
        </p>
      </div>
    );
  }

  const { data: integ } = await sb
    .schema('app')
    .from('tenant_integrations')
    .select('status, last_test_at, last_test_status, last_test_error')
    .eq('organization_id', (member as { organization_id: string }).organization_id)
    .eq('kind', 'zoom_s2s')
    .maybeSingle();

  const status: ZoomStatus = integ
    ? {
        configured: true,
        lastTestAt: (integ as { last_test_at: string | null }).last_test_at,
        lastTestStatus: (integ as { last_test_status: 'success' | 'error' | null }).last_test_status,
        lastTestError: (integ as { last_test_error: string | null }).last_test_error,
      }
    : { configured: false, lastTestAt: null, lastTestStatus: null, lastTestError: null };

  return (
    <div className="space-y-6">
      <Link
        href="/parametres/integrations"
        className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
      >
        <ArrowLeft className="w-3 h-3" />
        Retour aux intégrations
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <Video className="w-3.5 h-3.5 text-violet-500" />
        <SectionLabel>Zoom Server-to-Server</SectionLabel>
      </div>

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 -mt-2">
        Synchronisez automatiquement la présence des sessions distancielles via l&apos;API Zoom.
        Les secrets sont chiffrés AES-256-GCM côté serveur.
      </p>

      <ZoomS2sForm initialStatus={status} />
    </div>
  );
}
