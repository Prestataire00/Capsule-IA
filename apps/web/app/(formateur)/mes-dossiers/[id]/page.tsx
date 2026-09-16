// ARCHETYPE: command
// Justification: un dossier confié, vu par le formateur — client, apprenants,
// séances et émargement. Rien de financier n'est chargé ni affiché.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ClipboardList,
  Info,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  Users,
  Video,
} from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadMyDossier, requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { heure, jourLong } from '@/features/trainer-space/dates';

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

const carte = 'rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4';
const titreCarte = 'text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2 mb-2';

export default async function DossierConfiePage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerDossier(params.id);
  if (!acces.ok) notFound();

  const detail = await loadMyDossier(acces.sb, params.id);
  if (!detail) notFound();
  const { dossier, referent, apprenants, seances, notes, accessibilityNotes } = detail;
  const st = STATUT[dossier.status] ?? { label: dossier.status, tone: 'neutral' as const };

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-5">
      <Link
        href="/mes-dossiers"
        className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="w-3 h-3" /> Mes dossiers
      </Link>

      <header>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {dossier.formationTitle ?? 'Formation'}
          </h1>
          <StatusPill tone={st.tone}>{st.label}</StatusPill>
        </div>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
          <span>{dossier.reference}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" aria-hidden />
            {jourCourt(dossier.startDate)} → {jourCourt(dossier.endDate)}
          </span>
          {dossier.totalHours != null && <span>{Number(dossier.totalHours)} h</span>}
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" aria-hidden />
            {MODALITE[dossier.modality] ?? dossier.modality}
          </span>
        </p>
      </header>

      <section className={carte}>
        <p className={titreCarte}>
          <Building2 className="w-4 h-4 text-zinc-400" aria-hidden /> Client
        </p>
        <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
          {dossier.companyName ?? dossier.learnerName ?? 'Client non renseigné'}
        </p>
        {referent ? (
          <div className="mt-2 text-[13px] text-zinc-700 dark:text-zinc-300 space-y-0.5">
            <p className="font-medium">
              {[referent.firstName, referent.lastName].filter(Boolean).join(' ')}
              {referent.position ? <span className="font-normal text-zinc-500"> · {referent.position}</span> : null}
            </p>
            {referent.email && (
              <p className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
                <a href={`mailto:${referent.email}`} className="hover:underline">
                  {referent.email}
                </a>
              </p>
            )}
            {referent.phone && (
              <p className="inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
                <a href={`tel:${referent.phone}`} className="hover:underline">
                  {referent.phone}
                </a>
              </p>
            )}
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 pt-1">Votre interlocuteur chez le client.</p>
          </div>
        ) : (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
            Aucun référent désigné. Demandez-le à l’organisme si vous avez besoin d’un contact.
          </p>
        )}
      </section>

      <section className={carte}>
        <p className={titreCarte}>
          <Users className="w-4 h-4 text-zinc-400" aria-hidden /> Apprenants
          <span className="tabular-nums text-zinc-500 font-normal">({apprenants.length})</span>
        </p>
        {apprenants.length === 0 ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Aucun apprenant nommé pour l’instant — la liste vous sera transmise par l’organisme.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80 -mb-1">
            {apprenants.map((a) => (
              <li key={a.id} className="py-2 text-[13px]">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {a.firstName} {a.lastName}
                </p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-3">
                  {a.email && <span>{a.email}</span>}
                  {a.phone && <span className="tabular-nums">{a.phone}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={carte}>
        <p className={titreCarte}>
          <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden /> Séances
          <span className="tabular-nums text-zinc-500 font-normal">({seances.length})</span>
        </p>
        {seances.length === 0 ? (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Aucune séance planifiée.</p>
        ) : (
          <ul className="space-y-2">
            {seances.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {s.title ?? jourLong(s.startsAt)}
                  </span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {jourLong(s.startsAt)} · {heure(s.startsAt)} – {heure(s.endsAt)}
                    {s.location ? ` · ${s.location}` : ''}
                    {s.modality !== 'presentiel' ? ` · ${MODALITE[s.modality] ?? s.modality}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/seance/${s.id}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Video className="w-3.5 h-3.5" /> La séance
                  </Link>
                  <Link
                    href={`/emarger/${s.id}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> Émarger
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(notes || accessibilityNotes) && (
        <section className={carte}>
          <p className={titreCarte}>
            <Info className="w-4 h-4 text-zinc-400" aria-hidden /> Consignes
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

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
        Tarifs, devis, factures, financeurs et dépenses ne sont pas accessibles depuis votre espace : ils restent chez
        l’organisme.
      </p>

      <p className="text-[12px] text-zinc-400 dark:text-zinc-500 inline-flex items-center gap-1.5">
        <User className="w-3 h-3" aria-hidden /> Vos honoraires se gèrent dans « Factures » et « Frais ».
      </p>
    </div>
  );
}
