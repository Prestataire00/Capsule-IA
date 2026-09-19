// ARCHETYPE: command
// Justification: un dossier confié, vu par le formateur — client, apprenants,
// séances et émargement. Rien de financier n'est chargé ni affiché.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  FolderOpen,
  Info,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { loadMyDossier, requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { heure, jourLong, jourNumero, moisCourt } from '@/features/trainer-space/dates';
import { Chip, CarreIcone, Initiales } from '@/features/trainer-space/ui/chip';

export const dynamic = 'force-dynamic';

const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };
const STATUT: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' | 'danger' }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  pending_validation: { label: 'À valider', tone: 'warning' },
  scheduled: { label: 'Planifié', tone: 'info' },
  active: { label: 'En cours', tone: 'success' },
  completed: { label: 'Terminé', tone: 'neutral' },
  closed: { label: 'Clos', tone: 'neutral' },
  archived: { label: 'Archivé', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'danger' },
};

const carte = 'rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm';
const titreCarte = 'text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5 mb-3';
/** Action de contact : assez grande pour être touchée au doigt sur place. */
const bouton =
  'inline-flex items-center gap-2 min-h-[38px] px-3 rounded-lg text-[13px] font-medium transition shadow-sm';

export default async function DossierConfiePage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerDossier(params.id);
  if (!acces.ok) notFound();

  const detail = await loadMyDossier(acces.sb, params.id);
  if (!detail) notFound();
  const { dossier, referent, apprenants, seances, notes, accessibilityNotes } = detail;
  const st = STATUT[dossier.status] ?? { label: dossier.status, tone: 'neutral' as const };

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
      <Link
        href="/mes-dossiers"
        className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-orange-600 dark:hover:text-orange-400 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Mes dossiers
      </Link>

      <header className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-white to-sky-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-sky-950/30 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl grid place-items-center text-white bg-orange-500 shadow-md shadow-orange-500/30 shrink-0">
            <FolderOpen className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] leading-tight font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {dossier.formationTitle ?? 'Formation'}
              </h1>
              <StatusPill tone={st.tone}>{st.label}</StatusPill>
            </div>
            <IdPill className="mt-1.5 inline-block">{dossier.reference}</IdPill>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Chip accent="blue" icon={CalendarClock}>
            {jourCourt(dossier.startDate)} → {jourCourt(dossier.endDate)}
          </Chip>
          {dossier.totalHours != null && (
            <Chip accent="teal" icon={Clock}>
              {Number(dossier.totalHours)} h
            </Chip>
          )}
          <Chip accent="sky" icon={MapPin}>
            {MODALITE[dossier.modality] ?? dossier.modality}
          </Chip>
          <Chip accent="rose" icon={Users}>
            {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''}
          </Chip>
        </div>
      </header>

      <section className={carte}>
        <p className={titreCarte}>
          <CarreIcone accent="teal" icon={Building2} /> Client
        </p>
        <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          {dossier.companyName ?? dossier.learnerName ?? 'Client non renseigné'}
        </p>
        {referent ? (
          <div className="mt-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-3">
            <div className="flex items-center gap-3">
              <Initiales accent="rose" prenom={referent.firstName} nom={referent.lastName} />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {[referent.firstName, referent.lastName].filter(Boolean).join(' ')}
                </p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                  {referent.position ?? 'Votre interlocuteur chez le client'}
                </p>
              </div>
            </div>
            {(referent.email || referent.phone) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {referent.phone && (
                  <a
                    href={`tel:${referent.phone}`}
                    className={`${bouton} bg-rose-500 text-white hover:bg-rose-600 tabular-nums`}
                  >
                    <Phone className="w-4 h-4" aria-hidden /> {referent.phone}
                  </a>
                )}
                {referent.email && (
                  <a
                    href={`mailto:${referent.email}`}
                    className={`${bouton} bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                  >
                    <Mail className="w-4 h-4" aria-hidden /> Écrire
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2">
            Aucun référent désigné. Demandez-le à l’organisme si vous avez besoin d’un contact.
          </p>
        )}
      </section>

      <section className={carte}>
        <p className={titreCarte}>
          <CarreIcone accent="rose" icon={Users} /> Apprenants
          <span className="tabular-nums text-zinc-500 font-normal">({apprenants.length})</span>
        </p>
        {apprenants.length === 0 ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Aucun apprenant nommé pour l’instant — la liste vous sera transmise par l’organisme.
          </p>
        ) : (
          <ul className="space-y-2">
            {apprenants.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 transition">
                <Initiales accent="rose" prenom={a.firstName} nom={a.lastName} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {a.firstName} {a.lastName}
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-3 truncate">
                    {a.email && <span className="truncate">{a.email}</span>}
                    {a.phone && <span className="tabular-nums">{a.phone}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Préparation pédagogique — quiz et exercices du dossier (0171). */}
      <Link
        href={`/mes-dossiers/${params.id}/cours`}
        className="group rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/25 dark:to-zinc-900 px-4 py-3.5 flex items-center gap-3 shadow-sm hover:shadow-md transition"
      >
        <span className="w-10 h-10 rounded-xl grid place-items-center text-white bg-amber-500 shadow-md shadow-amber-500/30 shrink-0">
          <ListChecks className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Préparer mon cours</span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
            Quiz auto-corrigés et exercices, publiés dans l&apos;espace des stagiaires.
          </span>
        </span>
        <ArrowRight className="w-4 h-4 text-amber-300 dark:text-amber-700 group-hover:text-amber-600 transition shrink-0" />
      </Link>

      <section className={carte}>
        <p className={titreCarte}>
          <CarreIcone accent="blue" icon={CalendarClock} /> Séances
          <span className="tabular-nums text-zinc-500 font-normal">({seances.length})</span>
        </p>
        {seances.length === 0 ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Aucune séance planifiée.</p>
        ) : (
          <ul className="space-y-2.5">
            {seances.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20 p-3"
              >
                <div className="flex items-start gap-3">
                  {/* Pastille de date : le jour se lit avant le titre. */}
                  <span className="w-11 shrink-0 rounded-lg bg-blue-500 text-white text-center py-1 shadow-sm shadow-blue-500/30">
                    <span className="block text-[17px] font-semibold leading-none tabular-nums">
                      {jourNumero(s.startsAt)}
                    </span>
                    <span className="block text-[11px] uppercase tracking-wide opacity-90">{moisCourt(s.startsAt)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
                      {s.title ?? jourLong(s.startsAt)}
                    </p>
                    <p className="text-[12px] text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {jourLong(s.startsAt)} · {heure(s.startsAt)} – {heure(s.endsAt)}
                    </p>
                    {s.location && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-start gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 mt-px shrink-0 text-blue-500" aria-hidden />
                        {s.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <Link
                    href={`/emarger/${s.id}`}
                    className={`${bouton} bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20`}
                  >
                    <ClipboardList className="w-4 h-4" /> Émarger
                  </Link>
                  <Link
                    href={`/seance/${s.id}`}
                    className={`${bouton} bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40`}
                  >
                    <Video className="w-4 h-4" /> La séance
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(notes || accessibilityNotes) && (
        <section className="rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 shadow-sm">
          <p className={titreCarte}>
            <CarreIcone accent="amber" icon={Info} /> Consignes
          </p>
          {notes && <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{notes}</p>}
          {accessibilityNotes && (
            <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-line mt-2">
              <span className="font-medium">Accessibilité : </span>
              {accessibilityNotes}
            </p>
          )}
        </section>
      )}

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex items-start gap-2 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/40 px-3 py-2.5">
        <ShieldCheck className="w-4 h-4 mt-px shrink-0 text-emerald-500" aria-hidden />
        <span>
          Tarifs, devis, factures, financeurs et dépenses ne sont pas accessibles depuis votre espace : ils restent chez
          l’organisme. Vos honoraires se gèrent dans « Factures » et « Frais ».
        </span>
      </p>
    </div>
  );
}
