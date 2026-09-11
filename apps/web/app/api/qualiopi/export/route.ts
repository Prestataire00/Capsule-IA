import { NextResponse } from 'next/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { buildAuditExport } from '@/features/qualiopi/audit-export';

/**
 * Export du dossier de préparation à l'audit Qualiopi (archive ZIP).
 *
 * Autorisation explicite : les routes `/api` ne passent pas par la garde du
 * middleware. L'archive est construite en service role, bornée à
 * l'organisation du membre connecté.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'qualiopi') === 'none') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    const { bytes, filename } = await buildAuditExport(membre.organizationId);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[qualiopi/export] échec', e);
    return NextResponse.json({ ok: false, error: 'export_failed' }, { status: 500 });
  }
}
