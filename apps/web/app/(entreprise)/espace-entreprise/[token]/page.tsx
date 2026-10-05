// ARCHETYPE: command
// Justification: l'espace du référent d'un client — ses dossiers et les
// documents que l'organisme lui a rendus visibles. Lecture seule, pas de
// signature : les documents y arrivent déjà signés.

import { notFound } from 'next/navigation';
import { Building2, CalendarDays, Download, Eye, FileText, FolderOpen } from 'lucide-react';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { chargerEspaceEntreprise } from '@/features/espace-entreprise/load';
import { TEMPLATE_KIND_LABELS } from '@/app/(dashboard)/documents/modeles/schema';

export const dynamic = 'force-dynamic';

const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const date = (iso: string | null) => (iso ? jour.format(new Date(iso)) : null);

export default async function EspaceEntreprisePage({ params }: { params: { token: string } }) {
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
  const espace = await chargerEspaceEntreprise(lien.value.contactId, lien.value.organizationId);
  if (!espace) notFound();

  const total = espace.dossiers.reduce((n, d) => n + d.documents.length, 0);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-white to-white dark:from-orange-950/30 dark:via-zinc-900 dark:to-zinc-900 p-5 shadow-sm flex items-center gap-4">
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
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
              {espace.entreprise ? `${espace.entreprise} · ` : ''}
              <span className="tabular-nums">{total}</span> document{total > 1 ? 's' : ''} à votre disposition
            </p>
          </div>
        </header>

        {espace.dossiers.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 text-center py-12">Aucune formation en cours pour l’instant.</p>
        ) : (
          espace.dossiers.map((d) => (
            <section key={d.id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <FolderOpen className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{d.formation ?? 'Formation'}</h2>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{d.reference}</span>
                    {d.debut && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CalendarDays className="w-3 h-3" /> {date(d.debut)}
                        {d.fin && d.fin !== d.debut ? ` – ${date(d.fin)}` : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {d.documents.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-zinc-500 dark:text-zinc-400">Pas encore de document pour cette formation.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {d.documents.map((doc) => (
                    <li key={doc.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="min-w-0 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</span>
                          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                            {TEMPLATE_KIND_LABELS[doc.kind as keyof typeof TEMPLATE_KIND_LABELS] ?? 'Document'} · {date(doc.createdAt)}
                          </span>
                        </span>
                      </span>
                      <a
                        href={
                          doc.aUnFichier
                            ? `/api/espace-entreprise/${params.token}/document/${doc.id}`
                            : `/espace-entreprise/${params.token}/document/${doc.id}`
                        }
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        {doc.aUnFichier ? <Download className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {doc.aUnFichier ? 'Télécharger' : 'Consulter'}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}

        <p className="text-[11px] text-zinc-400 text-center">
          Ce lien vous est personnel. Une question ? Répondez à l’e-mail qui vous l’a transmis.
        </p>
      </div>
    </main>
  );
}
