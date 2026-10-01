'use client';

import { FileText } from 'lucide-react';
import type { ProgrammeExtrait } from '@/features/formations/programme/programme-extrait';

/**
 * Ce que l'IA a repris du programme joint : c'est ce qui constituera le
 * programme de la formation, donc du dossier. Le HTML a été nettoyé côté
 * serveur (`nettoyerExtrait`) avant d'arriver ici.
 */
export function ProgrammeRepris({ programme }: { programme: ProgrammeExtrait }) {
  const texte = (titre: string, valeur: string) =>
    valeur.trim() ? (
      <Bloc titre={titre}>
        <p className="whitespace-pre-line">{valeur}</p>
      </Bloc>
    ) : null;
  const html = (titre: string, valeur: string) =>
    valeur.trim() ? (
      <Bloc titre={titre}>
        <div className="programme-html" dangerouslySetInnerHTML={{ __html: valeur }} />
      </Bloc>
    ) : null;
  const liste = (titre: string, valeurs: string[]) =>
    valeurs.length ? (
      <Bloc titre={titre}>
        <ul className="list-disc pl-5 space-y-0.5">
          {valeurs.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      </Bloc>
    ) : null;

  return (
    <details open className="mt-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-normal">
      <summary className="cursor-pointer select-none px-3 py-2 flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
        <FileText className="w-4 h-4 text-orange-500 shrink-0" />
        Programme repris par l’IA
        {programme.durationHours && (
          <span className="text-[12px] font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
            · {programme.durationHours} h
          </span>
        )}
      </summary>
      <div className="px-3 pb-3 space-y-3 text-[13px] text-zinc-700 dark:text-zinc-300 max-h-[480px] overflow-y-auto">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          C’est ce programme qui sera repris sur la fiche de la formation à l’ouverture du dossier. Relisez-le : tout
          reste modifiable ensuite sur la fiche formation.
        </p>
        {programme.title && (
          <div>
            <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{programme.title}</p>
            {programme.subtitle && <p className="text-zinc-500 dark:text-zinc-400">{programme.subtitle}</p>}
          </div>
        )}
        {liste('Objectifs pédagogiques', programme.objectives)}
        {texte('Public visé', programme.targetAudience)}
        {liste('Prérequis', programme.prerequisites)}
        {html('Programme détaillé', programme.programContent)}
        {texte('Déroulement', programme.deroulement)}
        {html('Méthodes pédagogiques', programme.pedagogicalMethod)}
        {html('Équipe pédagogique', programme.teachingTeam)}
        {html('Modalités d’évaluation', programme.evaluationMethod)}
        {html('Indicateurs de résultats', programme.resultIndicators)}
        {html('Accessibilité', programme.accessibilityInfo)}
      </div>
    </details>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400 mb-1">{titre}</h3>
      <div className="[&_h3]:font-semibold [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1">
        {children}
      </div>
    </section>
  );
}
