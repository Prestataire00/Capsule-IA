// ARCHETYPE: workflow
// Justification: relire le cours que le formateur prépare pour cette séance —
// exercices et supports — le valider, ou annoter en couleur ce qui est à revoir.

import { notFound } from 'next/navigation';
import { BookOpen, GraduationCap, ListChecks } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { loadSession } from '@/features/sessions/load-session';
import { loadSessionResources } from '@/features/trainer-space/session-resources';
import { loadTravaux, type Travail } from '@/features/pedagogie/store';
import { loadAnnotations } from '@/features/pedagogie/annotations-store';
import { peutValiderPourMembre } from '@/features/trainer-space/validation-recipients';
import { CarteCours, CarteSupport } from '../../../supports/_annotations/cartes-relecture';

export const dynamic = 'force-dynamic';

export default async function SessionCoursPage({ params }: { params: { id: string } }) {
  // `loadSession` lit sous RLS : une séance d'une autre organisation n'existe pas ici.
  const loaded = await loadSession(supabaseServer(), params.id);
  if (!loaded) notFound();
  const me = await getCurrentMember();
  if (!me) notFound();

  // Le cours de la séance, et le travail individuel des dossiers qu'elle sert.
  const [deLaSeance, desDossiers, supports, peutValider] = await Promise.all([
    loadTravaux({ type: 'seance', id: params.id }),
    Promise.all(loaded.dossierIds.map((id) => loadTravaux({ type: 'dossier', id }))),
    loadSessionResources(params.id),
    peutValiderPourMembre(me),
  ]);
  const vus = new Set<string>();
  const travaux: Travail[] = [...deLaSeance, ...desDossiers.flat()].filter((t) => !vus.has(t.id) && vus.add(t.id));

  const [annCours, annSupports] = await Promise.all([
    loadAnnotations('cours', travaux.map((t) => t.id)),
    loadAnnotations('support', supports.map((s) => s.id)),
  ]);

  const enAttente =
    travaux.filter((t) => t.isPublished && t.validationStatus === 'en_attente').length +
    supports.filter((s) => s.isPublished && s.validationStatus === 'en_attente').length;

  return (
    <div className="space-y-8">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
        {enAttente > 0 ? (
          <>
            <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">
              {enAttente} contenu{enAttente > 1 ? 's' : ''} à valider.
            </span>{' '}
          </>
        ) : null}
        Relisez ce que le formateur prépare. Annotez en couleur ce qui est à revoir : il le voit dans son espace et
        marque chaque point corrigé.
        {!peutValider && ' La décision revient aux propriétaires et administrateurs.'}
      </p>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <ListChecks className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            Exercices et quiz{' '}
            {travaux.length > 0 && <span className="text-zinc-400 tabular-nums font-normal">({travaux.length})</span>}
          </h2>
        </div>
        {travaux.length === 0 ? (
          <Vide texte="Le formateur n'a encore rien préparé pour cette séance." />
        ) : (
          <ul className="space-y-3">
            {travaux.map((t) => (
              <CarteCours key={t.id} travail={t} annotations={annCours.get(t.id) ?? []} peutValider={peutValider} meId={me.userId} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <BookOpen className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            Supports{' '}
            {supports.length > 0 && <span className="text-zinc-400 tabular-nums font-normal">({supports.length})</span>}
          </h2>
        </div>
        {supports.length === 0 ? (
          <Vide texte="Aucun support déposé pour cette séance." />
        ) : (
          <ul className="space-y-3">
            {supports.map((s) => (
              <CarteSupport key={s.id} support={s} annotations={annSupports.get(s.id) ?? []} peutValider={peutValider} meId={me.userId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-8 text-center">
      <span className="mx-auto mb-2 w-10 h-10 rounded-xl grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
        <GraduationCap className="h-5 w-5" />
      </span>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{texte}</p>
    </div>
  );
}
