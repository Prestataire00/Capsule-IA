// ARCHETYPE: command (sous-shell d'un dossier)
// Justification: hero + tabs d'un dossier, en données réelles (RLS-scopé).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, ClipboardList, Clock, FileText, Users as UsersIcon, Banknote } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { nomDuDossier } from '@/features/dossier/referent';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { PastilleFinancement } from '@/features/funders/pastille-financement';
import { chargerEtatsFinancement } from '@/features/funders/charger-etats';
import { FormateurChip } from './formateur-chip.client';
import { TabsNav } from '@/shared/components/layout/tabs-nav';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { KpiCard, ACCENTS } from '@/shared/ui/kpi-card';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
import { DossierStatusControl } from './dossier-status-control.client';
import type { DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const fmtEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;
const modalityLabel = (m: string) =>
  (({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' }) as Record<string, string>)[m] ?? m;

export default async function DossierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'reference, status, modality, start_date, end_date, total_hours, total_amount_cents, ' +
        'learner:learners!dossiers_learner_id_fkey(first_name, last_name, email), company:companies(name), formation:formations(id, title, metadata)',
    )
    .eq('id', params.id)
    .maybeSingle();
  // Une requête en échec n'est pas un dossier absent. L'erreur était jetée
  // ici, si bien qu'une jointure cassée s'affichait comme « ce dossier
  // n'existe pas » — sur un dossier qui venait d'être créé (21/09/2026).
  if (error) {
    console.error('[dossier] fiche illisible', params.id, error.code, error.message);
    throw new Error(`Fiche du dossier illisible : ${error.message}`);
  }
  if (!data) notFound();

  // Financement du dossier, lu par le chargeur commun à la liste : deux
  // écrans ne doivent pas annoncer deux restes à payer différents.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const etats = await chargerEtatsFinancement(sb as any, [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: params.id, total_amount_cents: (data as any).total_amount_cents },
  ]);
  const etatFinancement = etats.get(params.id) ?? {
    acquisCents: 0, enAttenteCents: 0, refuseCents: 0, resteAPayerCents: 0,
    resteSiToutAccordeCents: 0, sansFinanceur: true, enAttenteDeReponse: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const libreDemande = sb as unknown as SupabaseClient<any, any, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  // Demande d'origine : un dossier naît souvent d'une demande, et on doit
  // pouvoir y revenir — la fiche besoin et l'historique commercial y vivent.
  // Lecture tolérante : un dossier importé d'une convention n'en a aucune.
  const { data: demandeRow } = await libreDemande
    .schema('app')
    .from('prospects')
    .select('id, first_name, last_name')
    .eq('converted_dossier_id', params.id)
    .maybeSingle();
  const demande = demandeRow as { id: string; first_name: string | null; last_name: string | null } | null;

  // Formation ouverte par l'import d'une convention sans programme annexé :
  // le dossier existe, le programme reste à écrire.
  const programmeACompleter = Boolean(d.formation?.metadata?.catalog?.programmeACompleter);

  // Référent du client (0167), lu à part et sans faire tomber la fiche si la
  // colonne n'existe pas encore sur cette base.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const libre = sb as unknown as SupabaseClient<any, any, any>;
  const { data: lien } = await libre
    .schema('app')
    .from('dossiers')
    .select('contact:contacts(first_name, last_name, position, email, phone)')
    .eq('id', params.id)
    .maybeSingle();
  type ContactLu = { first_name: string | null; last_name: string | null; position: string | null; email: string | null; phone: string | null };
  const brut = (lien as unknown as { contact: ContactLu | ContactLu[] | null } | null)?.contact ?? null;
  const contact = Array.isArray(brut) ? (brut[0] ?? null) : brut;
  const referent = contact
    ? {
        firstName: contact.first_name,
        lastName: contact.last_name,
        position: contact.position,
        email: contact.email,
        phone: contact.phone,
      }
    : null;
  // Formateurs du dossier : lecture tolérante, la désignation vit dans la
  // bannière (un onglet pour un seul choix n'en valait pas la peine).
  const gererDossiers = await canManageSection('dossiers');
  const [{ data: liens }, { data: tousFormateurs }] = await Promise.all([
    libre.schema('app').from('dossier_trainers').select('trainer_id, is_lead').eq('dossier_id', params.id),
    gererDossiers
      ? libre
          .schema('app')
          .from('trainers')
          .select('id, first_name, last_name, email')
          .is('deleted_at', null)
          .order('last_name', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const formateursConnus = new Map(
    ((tousFormateurs ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).map(
      (t) => [t.id, { nom: [t.first_name, t.last_name].filter(Boolean).join(' ').trim() || 'Formateur', email: t.email }],
    ),
  );
  const rattaches = ((liens ?? []) as { trainer_id: string; is_lead: boolean }[]).map((r) => ({
    id: r.trainer_id,
    nom: formateursConnus.get(r.trainer_id)?.nom ?? 'Formateur',
    isLead: r.is_lead,
  }));
  // Les noms manquent quand la personne n'a pas le droit de voir la liste : on
  // les complète alors depuis les seuls formateurs rattachés.
  if (!gererDossiers && rattaches.length > 0) {
    const { data: nommes } = await libre
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name')
      .in('id', rattaches.map((r) => r.id));
    for (const t of (nommes ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      const cible = rattaches.find((r) => r.id === t.id);
      if (cible) cible.nom = [t.first_name, t.last_name].filter(Boolean).join(' ').trim() || 'Formateur';
    }
  }
  const dejaRattaches = new Set(rattaches.map((r) => r.id));
  const formateursDisponibles = [...formateursConnus.entries()]
    .filter(([id]) => !dejaRattaches.has(id))
    .map(([id, t]) => ({ id, label: t.email ? `${t.nom} · ${t.email}` : t.nom }));

  const { nom: learner, estReferent } = nomDuDossier({
    learner: { firstName: d.learner?.first_name, lastName: d.learner?.last_name, email: d.learner?.email },
    referent,
    companyName: d.company?.name ?? null,
  });

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-7xl w-full mx-auto px-8 py-9">
        <Link
          href="/dossiers"
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tous les dossiers
        </Link>

        <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <SectionLabel>Dossier</SectionLabel>
              <IdPill>{d.reference}</IdPill>
            </div>
            <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 truncate">{learner}</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 flex items-center gap-2 flex-wrap">
              {/* Le programme d'une formation sur mesure s'écrit souvent après
                  la convention : la fiche du dossier y mène directement. */}
              {d.formation?.id ? (
                <Link
                  href={`/formations/${d.formation.id}/programme`}
                  className="font-bold text-zinc-800 dark:text-zinc-200 hover:text-orange-600 dark:hover:text-orange-400 transition"
                >
                  {d.formation.title}
                </Link>
              ) : (
                <span className="font-bold text-zinc-800 dark:text-zinc-200">—</span>
              )}
              {d.company?.name && <span>{' · '}{d.company.name}</span>}
              {demande && (
                <Link
                  href={`/prospects/${demande.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/80 transition"
                  title="Ouvrir la demande dont ce dossier est issu"
                >
                  <ClipboardList className="w-3 h-3" aria-hidden /> Demande d’origine
                </Link>
              )}
              {programmeACompleter && d.formation?.id && (
                <Link
                  href={`/formations/${d.formation.id}/programme`}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70 transition"
                >
                  <FileText className="w-3 h-3" aria-hidden /> Programme à écrire
                </Link>
              )}
            </p>
            {referent && (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                {estReferent ? 'Référent du dossier' : 'Référent'} :{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {[referent.firstName, referent.lastName].filter(Boolean).join(' ')}
                </span>
                {referent.position ? ` · ${referent.position}` : ''}
                {referent.email ? ` · ${referent.email}` : ''}
                {referent.phone ? ` · ${referent.phone}` : ''}
                <span className="block text-[12px] text-zinc-400 dark:text-zinc-500">
                  Destinataire de la convention, des devis et des factures.
                  {estReferent ? ' La liste nominative des stagiaires n’est pas encore arrivée.' : ''}
                </span>
              </p>
            )}
            <FormateurChip
              dossierId={params.id}
              assignes={rattaches}
              disponibles={formateursDisponibles}
              gerer={gererDossiers}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DossierStatusControl dossierId={params.id} status={d.status as DossierStatus} />
            <ManageOnly section="dossiers">
              <DeleteEntityButton
                entite="dossier"
                id={params.id}
                nom={d.reference}
                article="ce dossier"
                variant="button"
                redirigerVers="/dossiers"
              />
            </ManageOnly>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8" aria-label="Chiffres clés du dossier">
          <KpiCard icon={Calendar} label="Période" accent="blue">
            <span className="text-[17px] font-extrabold tabular-nums text-blue-700 dark:text-blue-300">
              {fmtDate(d.start_date)} <span className="text-blue-400 dark:text-blue-500 font-semibold">→</span> {fmtDate(d.end_date)}
            </span>
          </KpiCard>
          <KpiCard icon={Clock} label="Heures totales" accent="sky" value={`${Number(d.total_hours ?? 0)} h`} />
          <KpiCard icon={UsersIcon} label="Modalité" accent="purple">
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-bold ${ACCENTS.purple.soft}`}>
              {modalityLabel(d.modality)}
            </span>
          </KpiCard>
          <KpiCard icon={Banknote} label="Montant" accent="emerald" value={fmtEuros(d.total_amount_cents)}>
            {/* Où en est le financement : la question se pose en même temps
                que le montant, elle se lit donc au même endroit. */}
            <PastilleFinancement etat={etatFinancement} className="mt-1.5" />
          </KpiCard>
        </section>

        <TabsNav baseHref={`/dossiers/${params.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

