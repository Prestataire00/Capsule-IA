// ARCHETYPE: command
// Justification: fiche détail entreprise — coordonnées, apprenants rattachés, dossiers liés.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone, Globe, Hash, MapPin, User, Users, FolderOpen, Download, Building2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { KpiCard, ACCENTS } from '@/shared/ui/kpi-card';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
import { ClientFormationsSection } from '@/features/formations/ui/client-formations-section';

export const dynamic = 'force-dynamic';

const TABLE_HEAD =
  'h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800';

function Line({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
      <Icon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
] as const;

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATARS.length;
  return AVATARS[h] ?? AVATARS[0];
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
      <header className="rounded-2xl border bg-gradient-to-br from-blue-50 to-white border-blue-100 dark:from-blue-950/40 dark:to-zinc-900 dark:border-blue-900/40 px-7 py-6 shadow-sm">
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
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-11 h-11 rounded-xl grid place-items-center text-white shadow-md shrink-0 ${ACCENTS.blue.chip}`}>
            <Building2 className="w-5 h-5" />
          </span>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 truncate">{c.name}</h1>
          <span className="ml-auto shrink-0">
            <ManageOnly section="crm">
              <DeleteEntityButton
                entite="entreprise"
                id={params.id}
                nom={c.name}
                article="cette entreprise"
                liens={`${learners.length} apprenant${learners.length > 1 ? 's' : ''} et ${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''} y sont rattachés.`}
                variant="button"
                redirigerVers="/entreprises"
              />
            </ManageOnly>
          </span>
        </div>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          {c.legal_name && c.legal_name !== c.name && <>{c.legal_name} · </>}
          <span className="tabular-nums">
            {learners.length} apprenant{learners.length > 1 ? 's' : ''} · {dossiers.length} dossier{dossiers.length > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Apprenants" value={learners.length} icon={Users} accent="rose" hint="rattachés" />
        <KpiCard label="Dossiers" value={dossiers.length} icon={FolderOpen} accent="orange" hint="liés" />
      </section>

      {/* BtoB : formations montées pour cette entreprise seule, hors catalogue. */}
      <ClientFormationsSection clientKind="company" clientId={c.id} clientName={c.name} />

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
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.rose.soft}`}>
            <Users className="w-4 h-4" />
          </span>
          Apprenants rattachés
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.rose.soft}`}>{learners.length}</span>
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
                          <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${avatarTone(name)}`}>
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
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
              <FolderOpen className="w-4 h-4" />
            </span>
            Dossiers
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.orange.soft}`}>{dossiers.length}</span>
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
