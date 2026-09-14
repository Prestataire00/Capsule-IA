// ARCHETYPE: command
// Justification: corbeille commune — tout ce qui a été supprimé dans le CRM, et de quoi le restaurer.

import { Trash2 } from 'lucide-react';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { loadTrash } from '@/features/corbeille/load-trash';
import { RestoreEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function CorbeillePage() {
  const membre = await getCurrentMember();
  const groupes = membre ? await loadTrash(membre.organizationId, membre.role) : [];
  const total = groupes.reduce((n, g) => n + g.lignes.length, 0);

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Corbeille</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Éléments supprimés</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
          {total} élément{total > 1 ? 's' : ''} · rien n&apos;est effacé : vous pouvez tout restaurer.
        </p>
      </header>

      {total === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm">
          <EmptyState
            icon={Trash2}
            title="La corbeille est vide."
            description="Les demandes, dossiers, apprenants, entreprises, formateurs, financeurs, séances et réclamations supprimés apparaissent ici, avec un bouton pour les remettre en service."
          />
        </div>
      ) : (
        <div className="space-y-8">
          {groupes.map((g) => (
            <section key={g.entite}>
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.rose.soft}`}>
                  <Trash2 className="w-4 h-4" />
                </span>
                {g.pluriel}
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.rose.soft}`}>
                  {g.lignes.length}
                </span>
              </h2>
              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
                {g.lignes.map((l) => (
                  <li key={`${l.entite}-${l.id}`} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{l.nom}</p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                        {l.detail ? `${l.detail} · ` : ''}
                        {l.supprimeLe ? `supprimé le ${dateFmt.format(new Date(l.supprimeLe))}` : 'supprimé'}
                      </p>
                    </div>
                    <RestoreEntityButton entite={l.entite} id={l.id} nom={l.nom} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
