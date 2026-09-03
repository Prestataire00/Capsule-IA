// ARCHETYPE: command
// Justification: fiche détail entreprise — coordonnées, apprenants rattachés, dossiers liés.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone, Globe, Hash, MapPin, User, Users, FolderOpen, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { requireAccess } from '@/shared/lib/auth/require-access';

export const dynamic = 'force-dynamic';

const palette = [
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
];

function Line({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
      <Icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export default async function EntrepriseDetailPage({ params }: { params: { id: string } }) {
  await requireAccess('crm');
  const sb = supabaseServer();

  const { data: cRow } = await sb
    .schema('app')
    .from('companies')
    .select('id, name, legal_name, siret, naf_code, vat_number, contact_name, contact_email, contact_phone, website, address, notes')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = cRow as any;
  if (!c) notFound();

  const [{ data: learnerRows }, { data: dossierRows }] = await Promise.all([
    sb.schema('app').from('learners').select('id, first_name, last_name, email').eq('company_id', params.id).is('deleted_at', null).order('last_name', { ascending: true }),
    sb
      .schema('app')
      .from('dossiers')
      .select('id, reference, status, learner:learners(first_name, last_name), formation:formations(title)')
      .eq('company_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const learners = ((learnerRows as any[]) ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossiers = ((dossierRows as any[]) ?? []);

  const initials = (c.name as string).split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase();
  const idx = (c.name as string).charCodeAt(0) % palette.length;
  const addr = c.address ?? {};
  const addrLine = [addr.line1, addr.postal_code, addr.city].filter(Boolean).join(', ');

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-8 space-y-6">
      <Link href="/entreprises" className="text-[13px] text-zinc-500 hover:text-violet-600 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Entreprises
      </Link>

      <header className="flex items-center gap-4">
        <span className={`w-14 h-14 rounded-xl flex items-center justify-center text-[16px] font-semibold shadow-sm ${palette[idx]}`}>{initials}</span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">{c.name}</h1>
          {c.legal_name && c.legal_name !== c.name && <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{c.legal_name}</p>}
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Apprenants" value={learners.length} icon={Users} accent="rose" hint="rattachés" hintTone="neutral" />
        <StatCard label="Dossiers" value={dossiers.length} icon={FolderOpen} accent="violet" hint="liés" hintTone="neutral" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 space-y-2.5">
          <SectionLabel>Coordonnées</SectionLabel>
          {c.contact_name && <Line icon={User}>{c.contact_name}</Line>}
          {c.contact_email && <Line icon={Mail}><a href={`mailto:${c.contact_email}`} className="hover:text-violet-600">{c.contact_email}</a></Line>}
          {c.contact_phone && <Line icon={Phone}>{c.contact_phone}</Line>}
          {c.website && <Line icon={Globe}><a href={c.website} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600">{c.website}</a></Line>}
          {addrLine && <Line icon={MapPin}>{addrLine}</Line>}
          {!c.contact_name && !c.contact_email && !c.contact_phone && !c.website && !addrLine && (
            <p className="text-[12px] text-zinc-400">Aucune coordonnée renseignée.</p>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 space-y-2.5">
          <SectionLabel>Identité légale</SectionLabel>
          {c.siret ? <Line icon={Hash}>SIRET {c.siret}</Line> : null}
          {c.naf_code ? <Line icon={Hash}>NAF {c.naf_code}</Line> : null}
          {c.vat_number ? <Line icon={Hash}>TVA {c.vat_number}</Line> : null}
          {!c.siret && !c.naf_code && !c.vat_number && <p className="text-[12px] text-zinc-400">Non renseignée.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Apprenants rattachés ({learners.length})</SectionLabel>
        {learners.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun apprenant rattaché à cette entreprise. Rattachez une entreprise depuis la fiche d’un apprenant.
          </p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
            {learners.map((l) => (
              <li key={l.id}>
                <Link href={`/apprenants/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
                  <span className="text-zinc-900 dark:text-zinc-100">{[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}</span>
                  {l.email && <span className="text-[12px] text-zinc-400 truncate">{l.email}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionLabel>Dossiers ({dossiers.length})</SectionLabel>
          {/* Un financeur ou un auditeur demande l'assiduité de tous les salariés
              d'une entreprise : l'export la produit, absents compris. */}
          <a
            href={`/api/emargements/export.csv?companyId=${params.id}`}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Émargements (CSV)
          </a>
        </div>
        {dossiers.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun dossier lié à cette entreprise.</p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
            {dossiers.map((d) => {
              const learner = d.learner ? [d.learner.first_name, d.learner.last_name].filter(Boolean).join(' ') : null;
              return (
                <li key={d.id}>
                  <Link href={`/dossiers/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
                    <IdPill>{d.reference}</IdPill>
                    <span className="text-zinc-700 dark:text-zinc-300 flex-1 truncate">{d.formation?.title ?? '—'}{learner ? ` · ${learner}` : ''}</span>
                    <StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
