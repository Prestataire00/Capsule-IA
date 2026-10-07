// ARCHETYPE: workflow
// Justification: l'espace du référent d'un client — ce qui l'attend, le
// planning de ses apprenants, leurs heures et émargements, ses documents, ses
// devis et factures, et ses échanges avec l'organisme.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarDays, Clock, ListChecks, MessageSquareWarning, Receipt, Users } from 'lucide-react';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { chargerEspaceComplet } from '@/features/espace-entreprise/espace-complet';
import { VueActions } from './_vues/actions';
import { VuePlanning } from './_vues/planning';
import { VueApprenants } from './_vues/apprenants';
import { VueDocuments } from './_vues/documents';
import { VueFacturation } from './_vues/facturation';
import { VueEchanges } from './_vues/echanges.client';
import { euros, heures, jourLong, heure } from './_vues/format';

export const dynamic = 'force-dynamic';

const ONGLETS = [
  { cle: 'actions', libelle: 'À faire' },
  { cle: 'planning', libelle: 'Planning' },
  { cle: 'apprenants', libelle: 'Apprenants' },
  { cle: 'documents', libelle: 'Documents' },
  { cle: 'facturation', libelle: 'Facturation' },
  { cle: 'echanges', libelle: 'Échanges' },
] as const;
type Onglet = (typeof ONGLETS)[number]['cle'];

export default async function EspaceEntreprisePage({ params, searchParams }: { params: { token: string }; searchParams: { onglet?: string; vue?: string; fil?: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 grid place-items-center px-4">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Ce lien n’est plus valable</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {lien.error === 'expired_token' ? 'Il a expiré.' : 'Il a été remplacé ou retiré.'} Demandez un nouveau lien à
            votre organisme de formation.
          </p>
        </div>
      </main>
    );
  }
  const espace = await chargerEspaceComplet(lien.value.contactId, lien.value.organizationId, params.token);
  if (!espace) notFound();

  const onglet: Onglet = ONGLETS.some((o) => o.cle === searchParams.onglet)
    ? (searchParams.onglet as Onglet)
    : espace.actions.length > 0
      ? 'actions'
      : 'planning';
  const prochaine = espace.seances.find((s) => !s.passee) ?? null;
  const realisees = espace.apprenants.reduce((t, a) => t + a.heures.realisees, 0);
  const prevues = espace.apprenants.reduce((t, a) => t + a.heures.prevues, 0);
  const reste = espace.factures.reduce((t, f) => t + f.resteCents, 0);
  const compte: Partial<Record<Onglet, number>> = {
    actions: espace.actions.length,
    apprenants: espace.apprenants.length,
    documents: espace.dossiers.reduce((n, d) => n + d.documents.length, 0),
  };

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-white to-white dark:from-orange-950/30 dark:via-zinc-900 dark:to-zinc-900 p-5 shadow-lg">
          <div className="flex items-center gap-4">
            {espace.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={espace.logo} alt="" className="w-14 h-14 rounded-xl object-contain bg-white" />
            ) : (
              <span className="w-14 h-14 rounded-xl grid place-items-center bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                <Building2 className="w-6 h-6" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{espace.organisme} · Espace entreprise</p>
              <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Bonjour {espace.referent}</h1>
              {espace.entreprise && <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">{espace.entreprise}</p>}
            </div>
          </div>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <Chiffre icone={ListChecks} teinte="bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300" libelle="À faire" valeur={String(espace.actions.length)} />
            <Chiffre icone={Users} teinte="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" libelle="Apprenants" valeur={String(espace.apprenants.length)} />
            <Chiffre
              icone={CalendarDays}
              teinte="bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
              libelle="Prochaine séance"
              valeur={prochaine ? `${jourLong.format(new Date(prochaine.debut))}` : '—'}
              detail={prochaine ? `${heure.format(new Date(prochaine.debut))} – ${heure.format(new Date(prochaine.fin))}` : undefined}
            />
            {reste > 0 ? (
              <Chiffre icone={Receipt} teinte="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" libelle="Reste à payer" valeur={euros(reste)} />
            ) : (
              <Chiffre
                icone={Clock}
                teinte="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                libelle="Heures réalisées"
                valeur={heures(realisees)}
                detail={prevues > 0 ? `sur ${heures(prevues)} prévues` : undefined}
              />
            )}
          </dl>
        </header>

        <nav aria-label="Rubriques de l’espace" className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 -mx-1 px-1">
          {ONGLETS.map((o) => (
            <Link
              key={o.cle}
              href={`/espace-entreprise/${params.token}?onglet=${o.cle}`}
              aria-current={onglet === o.cle ? 'page' : undefined}
              className={`shrink-0 h-10 px-3 inline-flex items-center gap-1.5 text-[13px] border-b-2 -mb-px transition ${
                onglet === o.cle
                  ? 'border-orange-500 text-orange-700 dark:text-orange-300 font-medium'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {o.libelle}
              {compte[o.cle] ? (
                <span
                  className={`h-5 min-w-5 px-1.5 rounded-full text-[11px] grid place-items-center tabular-nums ${
                    o.cle === 'actions' ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {compte[o.cle]}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        {onglet === 'actions' && <VueActions actions={espace.actions} />}
        {onglet === 'planning' && <VuePlanning seances={espace.seances} token={params.token} vue={searchParams.vue === 'liste' ? 'liste' : 'tableau'} />}
        {onglet === 'apprenants' && <VueApprenants apprenants={espace.apprenants} token={params.token} />}
        {onglet === 'documents' && <VueDocuments dossiers={espace.dossiers} token={params.token} seancesAVenir={espace.seances.filter((s) => !s.passee).length} />}
        {onglet === 'facturation' && <VueFacturation factures={espace.factures} devis={espace.devis} prix={espace.prix} token={params.token} />}
        {onglet === 'echanges' && <VueEchanges token={params.token} organisme={espace.organisme} echanges={espace.echanges} equipe={espace.equipe} fil={searchParams.fil} />}

        <Link
          href={`/espace-entreprise/${params.token}/reclamation`}
          className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md px-5 py-4 flex items-center gap-3"
        >
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <MessageSquareWarning className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Faire une réclamation</span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">Un souci avec une formation ? Signalez-le à l’organisme.</span>
          </span>
        </Link>

        <p className="text-[11px] text-zinc-400 text-center">Ce lien vous est personnel : merci de ne pas le transférer.</p>
      </div>
    </main>
  );
}

function Chiffre({
  icone: Icone,
  teinte,
  libelle,
  valeur,
  detail,
}: {
  icone: typeof Users;
  teinte: string;
  libelle: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/70 dark:border-zinc-800 p-3 flex items-start gap-2.5 min-w-0">
      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${teinte}`}>
        <Icone className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{libelle}</dt>
        <dd className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 tabular-nums truncate first-letter:uppercase">{valeur}</dd>
        {detail && <dd className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{detail}</dd>}
      </div>
    </div>
  );
}
