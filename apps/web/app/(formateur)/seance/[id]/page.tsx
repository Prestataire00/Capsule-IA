// ARCHETYPE: command
// Justification: le poste de travail du formateur sur une séance — qui il a en face,
// comment les joindre, où se retrouver en visio, et par où passer pour le reste.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, ListChecks, PenLine, Mail, Phone, Users, Building2, Home, BookOpen, MessagesSquare, ArrowRight } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadSessionContacts, type Contact } from '@/features/trainer-space/session-contacts';
import { loadSessionResources } from '@/features/trainer-space/session-resources';
import { loadSessionMessages } from '@/features/trainer-space/session-messages';
import { estVisibleParApprenant } from '@/features/trainer-space/support-status';
import { VisioForm } from './visio-form.client';
import { SeanceNav } from './_components/seance-nav';

export const dynamic = 'force-dynamic';

function ContactList({
  titre,
  icone: Icone,
  ton,
  contacts,
  vide,
}: {
  titre: string;
  icone: React.ComponentType<{ className?: string }>;
  ton: string;
  contacts: readonly Contact[];
  vide: string;
}) {
  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <span className={`w-7 h-7 rounded-md grid place-items-center ${ton}`}>
          <Icone className="w-4 h-4" />
        </span>
        <h2 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
          {titre} {contacts.length > 0 && <span className="text-zinc-400 tabular-nums">({contacts.length})</span>}
        </h2>
      </div>
      {contacts.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-zinc-400">{vide}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {contacts.map((c, i) => (
            <li key={`${c.name}-${i}`} className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.name}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{c.role}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    title={c.email}
                    className="h-8 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Mail className="w-3.5 h-3.5" /> Écrire
                  </a>
                )}
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, '')}`}
                    className="h-8 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5" /> {c.phone}
                  </a>
                )}
                {!c.email && !c.phone && <span className="text-[12px] text-zinc-400">Aucun contact renseigné</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Raccourci({
  href,
  icone: Icone,
  label,
  detail,
  ton,
  primaire,
}: {
  href: string;
  icone: React.ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  ton: string;
  /** L'émargement est l'acte de la séance : il ne se cherche pas parmi les autres. */
  primaire?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-xl border px-4 py-3 transition flex items-center gap-3 ${
        primaire
          ? 'border-orange-200 dark:border-orange-900/50 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/30 dark:to-zinc-900 hover:shadow-md'
          : 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-orange-300 dark:hover:border-orange-900/60 hover:shadow-sm'
      }`}
    >
      <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${ton}`}>
        <Icone className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{label}</span>
        {detail && <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{detail}</span>}
      </span>
      <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-500 transition shrink-0" />
    </Link>
  );
}

export default async function SeancePage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();

  // Service role après la garde : le formateur externe n'est pas membre de
  // l'organisme, mais cette séance est bien l'une des siennes.
  const admin = supabaseAdmin();
  const loaded = await loadSession(admin, params.id);
  if (!loaded) notFound();
  const { session, formation } = loaded;

  const [contacts, supports, messages] = await Promise.all([
    loadSessionContacts({ id: session.id, organization_id: session.organization_id, dossier_id: session.dossier_id ?? null }),
    loadSessionResources(params.id),
    loadSessionMessages(params.id),
  ]);

  // « Visible » = validé par l'administration ET toujours proposé par le formateur.
  const publies = supports.filter(estVisibleParApprenant).length;

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <SeanceNav
        sessionId={params.id}
        quand={`${jourLong(session.starts_at)} · ${heure(session.starts_at)} – ${heure(session.ends_at)}`}
        titre={formation?.title ?? session.title ?? 'Séance'}
        sousTitre={session.location ?? (session.modality === 'distanciel' ? 'À distance' : undefined)}
        actif="seance"
      />

      <VisioForm sessionId={params.id} initialUrl={session.remote_url ?? null} />

      <ContactList
        titre="Participants"
        icone={Users}
        ton="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
        contacts={contacts.participants}
        vide="Aucun participant rattaché à cette séance."
      />

      <ContactList
        titre="Entreprise cliente"
        icone={Building2}
        ton="bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
        contacts={contacts.entreprises}
        vide="Formation à titre individuel : pas d'entreprise cliente."
      />

      <ContactList
        titre="Organisme"
        icone={Home}
        ton="bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
        contacts={contacts.organisme ? [contacts.organisme] : []}
        vide="Coordonnées de l'organisme non renseignées."
      />

      <section className="space-y-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Ma séance</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <Raccourci
            href={`/seance/${params.id}/supports`}
            icone={BookOpen}
            ton="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
            label="Supports de cours"
            detail={supports.length === 0 ? 'Aucun support déposé' : `${supports.length} déposé${supports.length > 1 ? 's' : ''} · ${publies} visible${publies > 1 ? 's' : ''}`}
          />
          <Raccourci
            href={`/seance/${params.id}/messages`}
            icone={MessagesSquare}
            ton="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
            label="Messages"
            detail={messages.length === 0 ? 'Aucun message' : `${messages.length} message${messages.length > 1 ? 's' : ''}`}
          />
          <Raccourci
            href={`/seance/${params.id}/fiches-besoin`}
            icone={ClipboardList}
            ton="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
            label="Fiches besoin"
          />
          <Raccourci
            href={`/seance/${params.id}/questionnaires`}
            icone={ListChecks}
            ton="bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
            label="Questionnaires"
          />
          <Raccourci
            href={`/emarger/${params.id}`}
            icone={PenLine}
            ton="bg-orange-500 text-white shadow-sm shadow-orange-500/30"
            label="Émargement"
            detail="Faire signer et clôturer"
            primaire
          />
        </div>
      </section>
    </div>
  );
}
