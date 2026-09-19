// ARCHETYPE: workflow
// Justification: reprendre une affaire déjà signée — la convention et ses
// programmes alimentent le client, la formation, les séances et le suivi.

import Link from 'next/link';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { ImportConventionClient } from './import-client';

export const dynamic = 'force-dynamic';

export default async function ImportConventionPage() {
  await requireAccess('catalogue', 'manage');

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-9">
      <Link
        href="/formations"
        className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour au catalogue
      </Link>

      <header className="mb-6">
        <SectionLabel className="mb-2">Reprise de dossier</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-3">
          <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
            <Sparkles className="w-5 h-5" />
          </span>
          Importer une convention
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
          Déposez une convention signée (et ses programmes annexés) : la lecture en extrait le client, la formation avec ses
          modules, les dates de séances et le tarif. Vous relisez, puis tout est créé d’un coup.
        </p>
      </header>

      <div className="mb-5 text-[12px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-4 py-3">
        <p className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
          <FileText className="w-3.5 h-3.5" /> Ce qui est créé
        </p>
        <p className="mt-1">
          L’entreprise cliente et le contact de son signataire · la formation sur mesure, hors catalogue, avec son programme
          et son tarif · <strong>le dossier du client</strong>, qui rassemble tout · une séance par date de la convention ·
          la convention et les programmes rattachés aux documents du dossier · une tâche pour récupérer la liste nominative
          si les stagiaires ne sont pas nommés. Aucun devis ni facture n’est émis.
        </p>
      </div>

      <ImportConventionClient />
    </div>
  );
}
