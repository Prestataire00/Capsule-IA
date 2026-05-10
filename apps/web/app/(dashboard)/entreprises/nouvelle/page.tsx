// ARCHETYPE: workflow
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Building2,
  Mail,
  Phone,
  MapPin,
  Hash,
  Search,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';

type SireneHit = {
  siren: string;
  nom_complet: string;
  nom_raison_sociale: string | null;
  siege: {
    siret: string | null;
    adresse: string | null;
    code_postal: string | null;
    libelle_commune: string | null;
  } | null;
};

const SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search';

export default function NouvelleEntreprisePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SireneHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    legalName: '',
    siret: '',
    email: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
  });

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
        const res = await fetch(
          `${SEARCH_URL}?q=${encodeURIComponent(q)}&per_page=8`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        setResults(Array.isArray(data?.results) ? data.results : []);
        setOpen(true);
      } catch {
        // ignore aborts / network
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
    setForm((f) => ({
      ...f,
      name: hit.nom_complet ?? '',
      legalName: hit.nom_raison_sociale ?? '',
      siret: hit.siege?.siret ?? '',
      address: hit.siege?.adresse ?? '',
      postalCode: hit.siege?.code_postal ?? '',
      city: hit.siege?.libelle_commune ?? '',
    }));
    setSelected(hit.nom_complet);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/entreprises"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux entreprises
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950/60 dark:to-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-center shadow-sm">
            <Building2 className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouvelle entreprise
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Recherchez par nom ou SIRET — les champs se remplissent automatiquement.
            </p>
          </div>
        </header>

        <form
          action="/entreprises"
          method="get"
          className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800"
        >
          <section className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">
                Recherche INSEE
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Tapez un nom ou un SIRET (3 caractères min)…"
                className={`${inputClass} pl-9 pr-9`}
                autoComplete="off"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 animate-spin" />
              )}

              {open && results.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto scrollbar-thin">
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
                  Aucun résultat. Vous pouvez saisir manuellement ci-dessous.
                </div>
              )}
            </div>

            {selected && (
              <div className="flex items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-lg">
                <Check className="w-3.5 h-3.5" />
                <span>
                  Pré-rempli depuis l'INSEE — <strong className="font-semibold">{selected}</strong>. Vous pouvez ajuster les champs ci-dessous.
                </span>
              </div>
            )}
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Identification</p>
            <FormField label="Nom commercial" required>
              <input
                type="text"
                name="name"
                required
                value={form.name}
                onChange={update('name')}
                placeholder="Acme Conseil"
                className={inputClass}
              />
            </FormField>
            <FormField label="Raison sociale" hint="Laissez vide si identique au nom commercial.">
              <input
                type="text"
                name="legalName"
                value={form.legalName}
                onChange={update('legalName')}
                placeholder="ACME CONSEIL SAS"
                className={inputClass}
              />
            </FormField>
            <FormField label="SIRET" required hint="14 chiffres, sans espaces.">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  name="siret"
                  required
                  pattern="[0-9]{14}"
                  value={form.siret}
                  onChange={update('siret')}
                  placeholder="12345678900012"
                  className={`${inputClass} pl-9 font-mono`}
                />
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Contact</p>
            <FormField label="Email" required>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="email"
                  name="email"
                  required
                  value={form.email}
                  onChange={update('email')}
                  placeholder="contact@acme.fr"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </FormField>
            <FormField label="Téléphone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="01 23 45 67 89"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </FormField>
          </section>

          <section className="p-6 space-y-4">
            <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Adresse</p>
            <FormField label="Adresse">
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={update('address')}
                placeholder="12 rue de la République"
                className={inputClass}
              />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Code postal" className="col-span-1">
                <input
                  type="text"
                  name="postalCode"
                  value={form.postalCode}
                  onChange={update('postalCode')}
                  placeholder="75001"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Ville" className="col-span-2">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={update('city')}
                    placeholder="Paris"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
            </div>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3">
            <Link href="/entreprises" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              Annuler
            </Link>
            <button
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              Créer l'entreprise
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
