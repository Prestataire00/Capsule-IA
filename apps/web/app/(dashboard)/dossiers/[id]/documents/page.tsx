// ARCHETYPE: command
// Justification: génération (modèles + IA + PDF) + liste réelle des documents du dossier.

import Link from 'next/link';
import { FileText, Download, Eye, Sparkles, FileDown, Files, CalendarClock, Building2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { GenerateFromTemplate, type TemplateChoice } from './_components/generate-from-template';
import { GenerateWithAi } from './_components/generate-with-ai';
import { EmailDocButton } from './_components/email-doc-button';
import { GenerateConventionsButton } from './_components/generate-conventions-button';

// PDF générés à la volée (générateurs pdf-lib existants : génèrent, persistent, renvoient le PDF).
// La convention est générée à part (1 par financeur + reste à charge) via GenerateConventionsButton.
const GENERATORS = [
  { kind: 'programme', label: 'Programme (PDF)', route: 'programme.pdf' },
  { kind: 'attestation_fin', label: 'Attestation de fin (PDF)', route: 'attestation.pdf' },
  { kind: 'certificat_realisation', label: 'Certificat de réalisation (PDF)', route: 'certificat.pdf' },
] as const;

const KIND_TO_ROUTE: Record<string, string> = {
  convention: 'convention.pdf',
  attestation_fin: 'attestation.pdf',
  certificat_realisation: 'certificat.pdf',
};

const jourCourt = (iso: string): string =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(iso));

/**
 * Une convention se lit différemment selon son destinataire : celle de
 * l'entreprise liste tous ses salariés, celle du stagiaire ne nomme que lui.
 * Deux lignes « convention » dans la liste étaient indiscernables.
 * `grouped` couvre les documents produits avant que `audience` existe.
 */
const EXEMPLAIRE: Record<string, { label: string; tone: string }> = {
  entreprise: { label: 'Entreprise', tone: ACCENTS.purple.soft },
  stagiaire: { label: 'Stagiaire', tone: ACCENTS.blue.soft },
};
const exemplaireDe = (m: { audience?: string | null; grouped?: boolean | null } | null) =>
  EXEMPLAIRE[m?.audience ?? (m?.grouped ? 'entreprise' : '')] ?? null;

const ROW_GRID = 'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_112px_minmax(0,1.2fr)] gap-4 px-5';
const ICON_BTN =
  'w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition';

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  // Dossier : formation (héritage modèles) + email apprenant (envoi par défaut).
  const { data: dRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('formation_id, company_id, learner:learners(email), company:companies(name, contact_email)')
    .eq('id', params.id)
    .maybeSingle();
  const dossier = dRow as unknown as {
    formation_id: string | null;
    company_id: string | null;
    learner: { email: string } | { email: string }[] | null;
    company: { name: string; contact_email: string | null } | { name: string; contact_email: string | null }[] | null;
  } | null;
  const learner = dossier ? (Array.isArray(dossier.learner) ? dossier.learner[0] : dossier.learner) : null;
  const company = dossier ? (Array.isArray(dossier.company) ? dossier.company[0] : dossier.company) : null;
  // Client entreprise : conventions, devis et factures vont à son responsable, pas au salarié.
  const learnerEmail = company?.contact_email ?? learner?.email ?? '';
  const formationId = dossier?.formation_id ?? null;

  // Séances du dossier : la convocation est nominative ET datée — elle n'existe
  // pas « pour le dossier », mais pour une séance précise (?session=<id>).
  // Rattachement direct ou via la table de liaison, comme partout ailleurs.
  const [liensRes, directRes] = await Promise.all([
    sb.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', params.id),
    // `app.sessions` n'a pas de `deleted_at` : une séance abandonnée est `cancelled`.
    sb.schema('app').from('sessions').select('id').eq('dossier_id', params.id),
  ]);
  const sessionIds = [
    ...new Set([
      ...(((directRes.data as { id: string }[] | null) ?? []).map((r) => r.id)),
      ...(((liensRes.data as { session_id: string }[] | null) ?? []).map((r) => r.session_id)),
    ]),
  ];
  const { data: seancesData } = sessionIds.length
    ? await sb
        .schema('app')
        .from('sessions')
        .select('id, title, starts_at, status')
        .in('id', sessionIds)
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true })
    : { data: [] };
  const seances = (seancesData as unknown as Array<{ id: string; title: string | null; starts_at: string }>) ?? [];

  const [docsRes, tplRes] = await Promise.all([
    sb
      .schema('app')
      .from('documents')
      .select('id, title, kind, status, content_html, storage_path, metadata, created_at')
      .eq('dossier_id', params.id)
      .order('created_at', { ascending: false }),
    sb
      .schema('app')
      .from('document_templates')
      .select('id, title, formation_id')
      .is('deleted_at', null)
      .order('title', { ascending: true }),
  ]);

  const rows =
    (docsRes.data as unknown as Array<{
      id: string;
      title: string;
      kind: string;
      status: string;
      content_html: string | null;
      storage_path: string | null;
      metadata: { payer?: string | null; audience?: string | null; grouped?: boolean | null; dossier_ids?: string[] | null } | null;
      created_at: string;
    }>) ?? [];

  // Héritage : modèles de la formation du dossier d'abord (étoile), puis globaux.
  const tplRows =
    (tplRes.data as unknown as Array<{ id: string; title: string; formation_id: string | null }>) ?? [];
  const templates: TemplateChoice[] = tplRows
    .filter((t) => t.formation_id === null || t.formation_id === formationId)
    .sort((a, b) => {
      const am = a.formation_id === formationId ? 0 : 1;
      const bm = b.formation_id === formationId ? 0 : 1;
      return am - bm;
    })
    .map((t) => ({
      id: t.id,
      title: t.formation_id && t.formation_id === formationId ? `★ ${t.title}` : t.title,
    }));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.purple.soft}`}>
              <Sparkles className="w-4 h-4" />
            </span>
            <SectionLabel>Générer depuis un modèle</SectionLabel>
          </div>
          <Link href="/documents/modeles" className="text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300">
            Gérer les modèles
          </Link>
        </div>
        <GenerateFromTemplate dossierId={params.id} templates={templates} />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Le modèle est rempli avec les données du dossier, puis consultable/imprimable. ★ = modèle de cette formation.
        </p>
        <GenerateWithAi dossierId={params.id} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
            <FileDown className="w-4 h-4" />
          </span>
          <SectionLabel>Générer un PDF standard</SectionLabel>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <GenerateConventionsButton dossierId={params.id} />
          {/* Convention de l'entreprise : elle couvre TOUS ses salariés de la
              séance, elle se génère donc là où la séance est — pas ici, où l'on
              ne voit qu'un dossier. Le lien évite de chercher. */}
          {company && seances[0] && (
            <Link
              href={`/sessions/${seances[0].id}/documents`}
              className="group flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 h-11 hover:border-orange-300 dark:hover:border-orange-800 transition"
            >
              <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS.purple.soft}`}>
                <Building2 className="w-3.5 h-3.5" />
              </span>
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate">
                Convention de l&apos;entreprise — {company.name}
              </span>
            </Link>
          )}
          {/* Une convocation par séance : nominative et datée. */}
          {seances.map((seance) => (
            <a
              key={seance.id}
              href={`/api/dossiers/${params.id}/convocation.pdf?session=${seance.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 h-11 hover:border-orange-300 dark:hover:border-orange-800 transition"
            >
              <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS.blue.soft}`}>
                <CalendarClock className="w-3.5 h-3.5" />
              </span>
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate tabular-nums">
                {seances.length > 1 ? `Convocation — ${jourCourt(seance.starts_at)}` : 'Convocation (PDF)'}
              </span>
              <Download className="w-3.5 h-3.5 text-zinc-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition" />
            </a>
          ))}
          {GENERATORS.map((g) => (
            <a
              key={g.kind}
              href={`/api/dossiers/${params.id}/${g.route}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 h-11 hover:border-orange-300 dark:hover:border-orange-800 transition"
            >
              <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS.blue.soft}`}>
                <FileText className="w-3.5 h-3.5" />
              </span>
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate">{g.label}</span>
              <Download className="w-3.5 h-3.5 text-zinc-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition" />
            </a>
          ))}
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Ouvrez un PDF une fois pour l&apos;enregistrer : il devient alors envoyable par email ci-dessous.
          {seances.length === 0 && ' La convocation demande une séance : planifiez-en une pour l’éditer.'}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.orange.soft}`}>
            <Files className="w-4 h-4" />
          </span>
          <SectionLabel>Documents générés</SectionLabel>
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.orange.soft}`}>{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
            <EmptyState icon={FileText} title="Aucun document généré pour ce dossier." description="Utilisez les options ci-dessus." />
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
            <div className="min-w-[680px]">
              <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
                <div>Document</div>
                <div>Type</div>
                <div>Statut</div>
                <div className="text-right">Actions</div>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {rows.map((d) => {
                  const pdfRoute = KIND_TO_ROUTE[d.kind];
                  const payer = d.metadata?.payer;
                  const exemplaire = d.kind === 'convention' ? exemplaireDe(d.metadata) : null;
                  const effectif = d.metadata?.dossier_ids?.length ?? 0;
                  const downloadHref = pdfRoute
                    ? `/api/dossiers/${params.id}/${pdfRoute}${
                        d.kind === 'convention' && payer ? `?payer=${encodeURIComponent(payer)}` : ''
                      }`
                    : null;
                  return (
                    <li key={d.id} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
                          <FileText className="w-4 h-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{d.title}</span>
                          {exemplaire && (
                            <span className="mt-0.5 inline-flex items-center gap-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${exemplaire.tone}`}>
                                {exemplaire.label}
                              </span>
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                {exemplaire.label === 'Entreprise'
                                  ? `${effectif || 1} stagiaire${effectif > 1 ? 's' : ''} — remise à l’entreprise`
                                  : 'remise au stagiaire'}
                              </span>
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{d.kind}</span>
                      <span>
                        <StatusPill tone={d.status === 'ready' ? 'success' : 'neutral'}>{d.status}</StatusPill>
                      </span>
                      <span className="flex items-center justify-end gap-0.5">
                        {d.storage_path && <EmailDocButton documentId={d.id} defaultEmail={learnerEmail} />}
                        {d.content_html || d.storage_path ? (
                          // HTML éditable OU PDF stocké → visualiseur universel (aperçu).
                          <Link href={`/documents/${d.id}/apercu`} aria-label={`Ouvrir — ${d.title}`} title="Ouvrir" className={ICON_BTN}>
                            <Eye className="w-4 h-4" />
                          </Link>
                        ) : (
                          downloadHref && (
                            // Pas encore de fichier stocké → génération PDF standard à la volée.
                            <a
                              href={downloadHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Ouvrir — ${d.title}`}
                              title="Ouvrir"
                              className={ICON_BTN}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )
                        )}
                      </span>
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
