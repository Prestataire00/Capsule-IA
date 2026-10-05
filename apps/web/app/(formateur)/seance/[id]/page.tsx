// ARCHETYPE: command
// Justification: le poste de travail du formateur sur une séance — qui il a en face,
// comment les joindre, où se retrouver en visio, et par où passer pour le reste.

import { notFound } from 'next/navigation';
import { Mail, Phone, Users, Building2, Home, Video, QrCode, Star } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadSessionContacts, type Contact } from '@/features/trainer-space/session-contacts';
import { VisioForm } from './visio-form.client';
import { LienVisio } from '@/shared/ui/lien-visio.client';
import { SeanceNav } from './_components/seance-nav';

export const dynamic = 'force-dynamic';

const DEMI_JOURNEE: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };

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
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
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


export default async function SeancePage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();

  // Service role après la garde : le formateur externe n'est pas membre de
  // l'organisme, mais cette séance est bien l'une des siennes.
  const admin = supabaseAdmin();
  const loaded = await loadSession(admin, params.id);
  if (!loaded) notFound();
  const { session, formation } = loaded;

  const contacts = await loadSessionContacts({
    id: session.id,
    organization_id: session.organization_id,
    dossier_id: session.dossier_id ?? null,
  });

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
      <SeanceNav
        sessionId={params.id}
        quand={`${jourLong(session.starts_at)} · ${heure(session.starts_at)} – ${heure(session.ends_at)}`}
        titre={formation?.title ?? session.title ?? 'Séance'}
        sousTitre={session.location ?? (session.modality === 'distanciel' ? 'À distance' : undefined)}
        actif="seance"
      />

      {session.remote_url ? (
        <section className="rounded-xl border border-sky-200/70 dark:border-sky-900/40 bg-sky-50/60 dark:bg-sky-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Video className="w-4 h-4" />
            </span>
            <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Visio de la séance</h2>
          </div>
          <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
            Rejoignez la séance d&apos;ici. L&apos;invitation est envoyée par la boîte formateur de l&apos;organisme ;
            les stagiaires et leur entreprise ont reçu le même lien.
          </p>
          <LienVisio url={session.remote_url} />
        </section>
      ) : (
        <VisioForm sessionId={params.id} initialUrl={null} />
      )}

      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <QrCode className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Émargement en salle</h2>
        </div>
        <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
          Affichez le QR code en début de cours : chaque stagiaire le scanne avec son téléphone et signe. Vous suivez les
          signatures en direct.
        </p>
        {loaded.sheets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {loaded.sheets.map((sh) => (
              <a
                key={sh.id}
                href={`/projection/${sh.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <QrCode className="w-4 h-4" /> Afficher le QR · {DEMI_JOURNEE[sh.half_day] ?? 'Journée'}
                <span className="text-zinc-400 tabular-nums">
                  {sh.signed}/{sh.total}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <a
            href={`/emarger/${params.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <QrCode className="w-4 h-4" /> Préparer les feuilles d&apos;émargement
          </a>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <Star className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Satisfaction en fin de séance</h2>
        </div>
        <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
          Projetez le QR code : chaque stagiaire le scanne et donne son avis sur son téléphone. Vous voyez les réponses
          arriver ; ceux qui ont répondu ne recevront pas l’e-mail de fin de formation.
        </p>
        <a
          href={`/projection/satisfaction/${params.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <QrCode className="w-4 h-4" /> Projeter le questionnaire de satisfaction
        </a>
      </section>

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

    </div>
  );
}
