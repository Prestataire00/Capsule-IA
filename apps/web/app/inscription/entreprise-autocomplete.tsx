'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { inputClass } from '@/shared/ui/form-field';

// Recherche d'entreprises via notre proxy serveur (évite le blocage CORS/CSP d'un
// appel direct depuis le navigateur vers recherche-entreprises.api.gouv.fr).
const SEARCH_URL = '/api/sirene/search';

type Etablissement = {
  siret: string | null;
  adresse: string | null;
  code_postal: string | null;
  libelle_commune: string | null;
  etat_administratif?: string | null;
};

type SireneHit = {
  siren: string;
  nom_complet: string;
  nom_raison_sociale: string | null;
  tranche_effectif_salarie: string | null;
  annee_tranche_effectif_salarie: string | null;
  siege: Etablissement | null;
  /** L'établissement qui répond à la recherche, quand ce n'est pas le siège. */
  matching_etablissements?: Etablissement[] | null;
  complements?: { liste_idcc?: string[] | null } | null;
};

/**
 * L'établissement recherché, et non le siège par défaut.
 *
 * Une recherche par SIRET vise un établissement précis ; reprendre celui du
 * siège aurait remplacé en silence le numéro que l'utilisateur venait de
 * taper, et rattaché le dossier à la mauvaise adresse.
 */
export const etablissementRecherche = (hit: {
  siege?: Etablissement | null;
  matching_etablissements?: Etablissement[] | null;
}): Etablissement | null => hit.matching_etablissements?.[0] ?? hit.siege ?? null;

export type CompanyAutofill = {
  name: string;
  siren: string;
  siret: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  /** Code de tranche d'effectif salarié INSEE (ex. "11"), à décoder côté appelant. */
  headcountRangeCode: string | null;
  /** IDCC de la convention collective (ex. « 1486 »), quand l'INSEE la connaît. */
  idcc: string | null;
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
  // « Aucun résultat » et « l'annuaire n'a pas répondu » appellent deux gestes
  // différents : corriger sa recherche, ou saisir à la main sans s'obstiner.
  const [panne, setPanne] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setPanne(false);
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
        // Le proxy répond 200 avec une liste vide quand l'annuaire est
        // injoignable : sans lire `error`, la panne passait pour une absence.
        setPanne(Boolean(data?.error));
        setOpen(true);
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setPanne(true);
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
    const et = etablissementRecherche(hit);
    onSelect({
      name: hit.nom_complet ?? hit.nom_raison_sociale ?? '',
      siren: hit.siren ?? '',
      siret: et?.siret ?? '',
      addressLine1: et?.adresse ?? '',
      postalCode: et?.code_postal ?? '',
      city: et?.libelle_commune ?? '',
      headcountRangeCode: hit.tranche_effectif_salarie ?? null,
      idcc: hit.complements?.liste_idcc?.[0] ?? null,
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
              const et = etablissementRecherche(hit);
              const city = et?.libelle_commune;
              const pc = et?.code_postal;
              const idcc = hit.complements?.liste_idcc?.[0];
              return (
                <li key={`${hit.siren}-${et?.siret ?? ''}`}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelect(hit)}
                    className="w-full text-left px-3 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {hit.nom_complet}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                      <span className="font-mono">SIRET {et?.siret ?? '—'}</span>
                      {(city || pc) && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span>{[pc, city].filter(Boolean).join(' ')}</span>
                        </>
                      )}
                      {idcc && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span>IDCC {idcc}</span>
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
            {panne
              ? 'L’annuaire des entreprises n’a pas répondu. Saisissez les informations manuellement ci-dessous.'
              : 'Aucun résultat. Vous pouvez saisir les informations manuellement ci-dessous.'}
          </div>
        )}
      </div>
    </div>
  );
}
