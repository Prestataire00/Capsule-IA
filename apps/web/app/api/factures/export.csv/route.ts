// ARCHETYPE: command
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';

const STATUSES: InvoiceStatus[] = [
  'draft',
  'issued',
  'paid',
  'partially_paid',
  'overdue',
  'cancelled',
];

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'brouillon',
  issued: 'émise',
  paid: 'payée',
  partially_paid: 'partielle',
  overdue: 'en retard',
  cancelled: 'annulée',
};

type ExportRow = {
  reference: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  currency: string;
  dossier: { reference: string } | null;
  funder: { name: string } | null;
  company: { name: string } | null;
};

/**
 * Échappe un champ CSV (séparateur ';', Excel FR).
 * Préfixe les valeurs commençant par =, +, -, @ pour prévenir l'injection de formule Excel.
 * Double-quote wrapping si le champ contient `"`, `;`, `,` ou `\n`.
 */
function escape(v: string | null | undefined): string {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";,\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Cents → euros, décimale `.`, pas de séparateur de milliers (import tableur). */
function euros(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

/** Payeur (F-FAC-04 / subrogation) : financeur (OPCO) prioritaire, sinon entreprise. */
function resolvePayer(row: ExportRow): string {
  if (row.funder?.name) return `OPCO/financeur: ${row.funder.name}`;
  if (row.company?.name) return `Entreprise: ${row.company.name}`;
  return '';
}

export async function GET(req: NextRequest) {
  // Le middleware laisse passer /api sans session : la garde est ici. Le filtre
  // d'organisation est explicite car la RLS `invoices_select` est plus étroite
  // que la matrice de rôles (elle exclut gestionnaire/référent, qui voient
  // pourtant la page /factures) — on s'aligne sur la page, pas sur la RLS.
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (can(me.role, 'billing') === 'none') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const statusParam = req.nextUrl.searchParams.get('status');
  const status = STATUSES.includes(statusParam as InvoiceStatus)
    ? (statusParam as InvoiceStatus)
    : null;

  let query = sb
    .schema('app')
    .from('invoices')
    .select(
      'reference, status, issued_at, due_at, paid_at, subtotal_cents, vat_cents, total_cents, currency, dossier:dossiers(reference), funder:funders(name), company:companies(name)',
    )
    .eq('organization_id', me.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'factures_export_failed', details: error.message },
      { status: 500 },
    );
  }

  const rows = (data as unknown as ExportRow[]) ?? [];

  const header = [
    'Référence',
    'Date émission',
    'Échéance',
    'Date règlement',
    'Statut',
    'Dossier',
    'Payeur',
    'HT (€)',
    'TVA (€)',
    'TTC (€)',
    'Devise',
  ].join(';');

  const lines = rows.map((r) =>
    [
      escape(r.reference),
      escape(r.issued_at),
      escape(r.due_at),
      escape(r.paid_at ? r.paid_at.slice(0, 10) : ''),
      escape(statusLabel[r.status] ?? r.status),
      escape(r.dossier?.reference),
      escape(resolvePayer(r)),
      escape(euros(r.subtotal_cents)),
      escape(euros(r.vat_cents)),
      escape(euros(r.total_cents)),
      escape(r.currency),
    ].join(';'),
  );

  // BOM UTF-8 pour Excel FR
  const csv = '﻿' + [header, ...lines].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="factures.csv"',
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
