// ARCHETYPE: workflow
// Justification: relire un e-mail reçu de l'organisme, depuis l'espace entreprise.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { courrielDuReferent } from '@/features/espace-entreprise/acces-referent';

export const dynamic = 'force-dynamic';

const quand = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' });

export default async function EchangePage({ params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) notFound();
  const courriel = await courrielDuReferent(lien.value.contactId, lien.value.organizationId, params.id);
  if (!courriel) notFound();

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Link
          href={`/espace-entreprise/${params.token}?onglet=echanges`}
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour aux échanges
        </Link>
        <header className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-4 flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <Mail className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">{courriel.subject ?? 'E-mail'}</h1>
            {courriel.sentAt && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 first-letter:uppercase tabular-nums">{quand.format(new Date(courriel.sentAt))}</p>}
          </div>
        </header>
        {courriel.html ? (
          // Un cadre isolé : le contenu de l'e-mail ne peut ni exécuter de script, ni toucher à la page.
          <iframe
            title={courriel.subject ?? 'E-mail'}
            srcDoc={courriel.html}
            sandbox=""
            className="w-full h-[70vh] rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white"
          />
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-5 py-10 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Le contenu de cet e-mail n’a pas été conservé : il a été envoyé avant que l’espace ne garde les messages. Vous
            le retrouverez dans votre boîte de réception.
          </p>
        )}
      </div>
    </main>
  );
}
