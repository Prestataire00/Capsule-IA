'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { inputClass } from '@/shared/ui/form-field';

// API publique gratuite (sans authentification) de recherche d'entreprises (INSEE/SIRENE).
const SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search';

type SireneHit = {
  siren: string;
  nom_complet: string;
  nom_raison_sociale: string | null;
  tranche_effectif_salarie: string | null;
  annee_tranche_effectif_salarie: string | null;
  siege: {
    siret: string | null;
    adresse: string | null;
    code_postal: string | null;
    libelle_commune: string | null;
  } | null;
};

export type CompanyAutofill = {
  name: string;
  siren: string;
  siret: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  /** Code de tranche d'effectif salarié INSEE (ex. "11"), à décoder côté appelant. */
  headcountRangeCode: string | null;
};

export function EntrepriseAutocomplete({
  onSelect,
  placeholder = 'Tapez le nom ou le SIRET de votre entreprise (3 caractères min)…',
}: {
  onSelect: (company: CompanyAutofill) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SireneHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}&per_page=8`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setResults(Array.isArray(data?.results) ? data.results : []);
        setOpen(true);
      } catch {
        // aborts / réseau : on ignore, saisie manuelle possible
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const handleSelect = (hit: SireneHit) => {
    onSelect({
      name: hit.nom_complet ?? hit.nom_raison_sociale ?? '',
      siren: hit.siren ?? '',
      siret: hit.siege?.siret ?? '',
      addressLine1: hit.siege?.adresse ?? '',
      postalCode: hit.siege?.code_postal ?? '',
      city: hit.siege?.libelle_commune ?? '',
      headcountRangeCode: hit.tranche_effectif_salarie ?? null,
    });
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-500" />
        <span className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">
          Recherche entreprise (INSEE)
        </span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`${inputClass} pl-9 pr-9`}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 animate-spin" />
        )}

        {open && results.length > 0 && (
          <ul className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
            {results.map((hit) => {
              const city = hit.siege?.libelle_commune;
              const pc = hit.siege?.code_postal;
              return (
                <li key={hit.siren}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelect(hit)}
                    className="w-full text-left px-3 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {hit.nom_complet}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                      <span className="font-mono">SIRET {hit.siege?.siret ?? '—'}</span>
                      {(city || pc) && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span>{[pc, city].filter(Boolean).join(' ')}</span>
                        </>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {open && !loading && query.trim().length >= 3 && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-lg z-10 px-3 py-2.5 text-[12px] text-zinc-500 dark:text-zinc-400">
            Aucun résultat. Vous pouvez saisir les informations manuellement ci-dessous.
          </div>
        )}
      </div>
    </div>
  );
}
