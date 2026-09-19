// ARCHETYPE: command
// Justification : catalogue de formations PUBLIC d'un OF (visible par tous, sans
// connexion). Grille des formations publiées + filtre par catégorie. Route
// racine (hors (dashboard)) whitelistée dans le middleware ; lecture via RPC
// anon list_published_formations (aucune fuite inter-OF).

import Link from 'next/link';
import { Clock, MapPin, Monitor, GraduationCap, ArrowRight, FileDown } from 'lucide-react';
import { getPublicCatalogByOrg, type PublicFormation } from '@/features/catalog/public-catalog';

export const dynamic = 'force-dynamic';

function modalityLabel(m: string | null): string {
  return m === 'distanciel' ? 'Distanciel' : m === 'hybride' ? 'Hybride' : 'Présentiel';
}

function FormationCard({ org, f }: { org: string; f: PublicFormation }) {
  const Icon = f.modality === 'distanciel' ? Monitor : MapPin;
  return (
    <Link
      href={`/catalogue/${f.id}?org=${encodeURIComponent(org)}`}
      className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-violet-300 hover:shadow-lg"
    >
      <div className="flex items-center gap-2 text-[11px] font-medium text-violet-700">
        <span className="rounded-full bg-violet-50 px-2 py-0.5">{f.code}</span>
        {f.category && <span className="text-zinc-400">{f.category}</span>}
      </div>
      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-zinc-900">{f.title}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" /> {modalityLabel(f.modality)}
        </span>
        {f.durationHours ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {f.durationHours} h
          </span>
        ) : null}
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-violet-700 opacity-0 transition group-hover:opacity-100">
        Voir le programme <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: { org?: string; cat?: string };
}) {
  const org = (searchParams.org ?? '').trim();
  const all = org ? await getPublicCatalogByOrg(org) : [];
  const categories = Array.from(new Set(all.map((f) => f.category).filter((c): c is string => !!c))).sort();
  const activeCat = (searchParams.cat ?? '').trim();
  const list = activeCat ? all.filter((f) => f.category === activeCat) : all;

  return (
    <main className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-violet-700">
              <GraduationCap className="h-5 w-5" />
              <span className="text-[13px] font-semibold uppercase tracking-wide">Catalogue de formations</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">Nos formations</h1>
            <p className="mt-1 text-[15px] text-zinc-500">
              {all.length} formation{all.length > 1 ? 's' : ''} disponible{all.length > 1 ? 's' : ''} — cliquez pour
              consulter le programme détaillé.
            </p>
          </div>
          {org && all.length > 0 && (
            <Link
              href={`/catalogue/imprimer?org=${encodeURIComponent(org)}`}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-zinc-800"
            >
              <FileDown className="h-4 w-4" />
              Catalogue PDF
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {!org ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-[13px] text-amber-800">
            Lien incomplet : ajoutez le paramètre <code className="font-mono">?org=&lt;identifiant OF&gt;</code> pour
            afficher un catalogue.
          </div>
        ) : all.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-[13px] text-zinc-500">
            Aucune formation publiée pour le moment.
          </div>
        ) : (
          <>
            {categories.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                <Link
                  href={`/catalogue?org=${encodeURIComponent(org)}`}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                    activeCat ? 'bg-white text-zinc-600 ring-1 ring-zinc-200' : 'bg-violet-700 text-white'
                  }`}
                >
                  Toutes
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c}
                    href={`/catalogue?org=${encodeURIComponent(org)}&cat=${encodeURIComponent(c)}`}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                      activeCat === c ? 'bg-violet-700 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200'
                    }`}
                  >
                    {c}
                  </Link>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((f) => (
                <FormationCard key={f.id} org={org} f={f} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
