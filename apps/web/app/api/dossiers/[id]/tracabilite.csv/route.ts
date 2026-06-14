import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';

export const dynamic = 'force-dynamic';

type AccessRow = {
  occurred_at: string;
  action: string;
  target_kind: string;
  target_id: string;
  actor_kind: string;
  learner_id: string | null;
};

/**
 * Échappe un champ CSV (séparateur ';', Excel FR).
 * Préfixe les valeurs commençant par =, +, -, @ pour prévenir l'injection de formule Excel.
 * Double-quote wrapping si le champ contient `"`, `;`, `,` ou `\n`.
 */
function escape(v: string | null | undefined): string {
  const s = v == null ? '' : String(v);
  // Injection-formula guard : préfixe par apostrophe si commence par =, +, -, @
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  // Wrapping si le champ contient des caractères réservés CSV
  return /[";,\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = supabaseServer();

  const { data, error } = await sb
    .schema('app')
    .from('resource_access_log' as never)
    .select('occurred_at, action, target_kind, target_id, actor_kind, learner_id')
    .eq('dossier_id', params.id)
    .order('occurred_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'tracabilite_fetch_failed', details: error.message },
      { status: 500 },
    );
  }

  const rows = (data as unknown as AccessRow[]) ?? [];

  const header = 'horodatage;action;type;cible;acteur;apprenant';

  const lines = rows.map((r) =>
    [
      escape(r.occurred_at),
      escape(r.action),
      escape(r.target_kind),
      escape(r.target_id),
      escape(r.actor_kind),
      escape(r.learner_id),
    ].join(';'),
  );

  // BOM UTF-8 pour Excel FR
  const csv = '﻿' + [header, ...lines].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tracabilite-${params.id}.csv"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
