// ARCHETYPE: command
// Justification: fiche détail entreprise — coordonnées, apprenants rattachés, dossiers liés.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone, Globe, Hash, MapPin, User, Users, FolderOpen, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { requireAccess } from '@/shared/lib/auth/require-access';

export const dynamic = 'force-dynamic';

const TABLE_HEAD =
  'h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800';

function Line({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
      <Icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function KeyFigure({ label, value, hint, icon: Icon }: { label: string; value: number; hint: string; icon: typeof Mail }) {
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
        <Icon className="w-4 h-4 text-zinc-400" />
      </div>
      <p className="mt-2 text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">{hint}</p>
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

  const addr = c.address ?? {};
  const addrLine = [addr.line1, addr.postal_code, addr.city].filter(Boolean).join(', ');

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9 space-y-6">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/entreprises"
            className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Entreprises
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
            ·
          </span>
          <SectionLabel>Entreprise</SectionLabel>
        </div>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 truncate">{c.name}</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          {c.legal_name && c.legal_name !== c.name && <>{c.legal_name} · </>}
          <span className="tabular-nums">
            {learners.length} apprenant{learners.length > 1 ? 's' : ''} · {dossiers.length} dossier{dossiers.length > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KeyFigure label="Apprenants" value={learners.length} icon={Users} hint="rattachés" />
        <KeyFigure label="Dossiers" value={dossiers.length} icon={FolderOpen} hint="liés" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-2.5">
          <SectionLabel>Coordonnées</SectionLabel>
          {c.contact_name && <Line icon={User}>{c.contact_name}</Line>}
          {c.contact_email && (
            <Line icon={Mail}>
              <a href={`mailto:${c.contact_email}`} className="hover:text-orange-600 dark:hover:text-orange-400">
                {c.contact_email}
              </a>
            </Line>
          )}
          {c.contact_phone && <Line icon={Phone}><span className="tabular-nums">{c.contact_phone}</span></Line>}
          {c.website && (
            <Line icon={Globe}>
              <a href={c.website} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] hover:text-orange-600 dark:hover:text-orange-400">
                {c.website}
              </a>
            </Line>
          )}
          {addrLine && <Line icon={MapPin}>{addrLine}</Line>}
          {!c.contact_name && !c.contact_email && !c.contact_phone && !c.website && !addrLine && (
            <p className="text-[12px] text-zinc-400">Aucune coordonnée renseignée.</p>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-2.5">
          <SectionLabel>Identité légale</SectionLabel>
          {c.siret ? <Line icon={Hash}>SIRET <span className="font-mono text-[12px]">{c.siret}</span></Line> : null}
          {c.naf_code ? <Line icon={Hash}>NAF <span className="font-mono text-[12px]">{c.naf_code}</span></Line> : null}
          {c.vat_number ? <Line icon={Hash}>TVA <span className="font-mono text-[12px]">{c.vat_number}</span></Line> : null}
          {!c.siret && !c.naf_code && !c.vat_number && <p className="text-[12px] text-zinc-400">Non renseignée.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
          Apprenants rattachés <span className="text-zinc-400 font-semibold tabular-nums">({learners.length})</span>
        </h2>
        {learners.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun apprenant rattaché à cette entreprise. Rattachez une entreprise depuis la fiche d’un apprenant.
          </p>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
            <div className="min-w-[520px]">
              <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-5 ${TABLE_HEAD}`}>
                <div>Apprenant</div>
                <div>E-mail</div>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {learners.map((l) => {
                  const name = [l.first_name, l.last_name].filter(Boolean).join(' ');
                  const initials = `${l.first_name?.[0] ?? ''}${l.last_name?.[0] ?? ''}`.toUpperCase();
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/apprenants/${l.id}`}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-5 py-3 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            {initials || '?'}
                          </span>
                          <span className="truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{name || '—'}</span>
                        </span>
                        <span className="truncate text-zinc-500 dark:text-zinc-400">{l.email || '—'}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
            Dossiers <span className="text-zinc-400 font-semibold tabular-nums">({dossiers.length})</span>
          </h2>
          {/* Un financeur ou un auditeur demande l'assiduité de tous les salariés
              d'une entreprise : l'export la produit, absents compris. */}
          <a
            href={`/api/emargements/export.csv?companyId=${params.id}`}
            className="text-[12px] font-semibold px-3 h-8 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Émargements (CSV)
          </a>
        </div>
        {dossiers.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun dossier lié à cette entreprise.</p>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
            <div className="min-w-[640px]">
              <div className={`grid grid-cols-[130px_minmax(0,1fr)_130px] gap-4 px-5 ${TABLE_HEAD}`}>
                <div>Référence</div>
                <div>Formation</div>
                <div>Statut</div>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {dossiers.map((d) => {
                  const learner = d.learner ? [d.learner.first_name, d.learner.last_name].filter(Boolean).join(' ') : null;
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/dossiers/${d.id}`}
                        className="grid grid-cols-[130px_minmax(0,1fr)_130px] gap-4 px-5 py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                      >
                        <span>
                          <IdPill>{d.reference}</IdPill>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{d.formation?.title ?? '—'}</span>
                          {learner && <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{learner}</span>}
                        </span>
                        <span>
                          <StatusPill tone={dossierStatusTone(d.status)}>{dossierStatusLabel(d.status)}</StatusPill>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
