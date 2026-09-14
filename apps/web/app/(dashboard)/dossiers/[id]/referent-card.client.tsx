'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, Mail, Phone, Pencil, Plus, Loader2, X, Building2 } from 'lucide-react';
import { designerReferent, creerEtDesignerReferent } from './referent-actions';

/**
 * Le référent du client, sur la vue d'ensemble du dossier.
 *
 * C'est la personne à qui partent la convention, les devis et les factures :
 * elle mérite une carte, pas une ligne grise. Et on doit pouvoir la désigner
 * ici — jusque-là, seul l'import d'une convention en posait un.
 */

export type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
};

const CHAMP =
  'w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400';

export function ReferentCard({
  dossierId,
  referent,
  contacts,
  companyName,
  peutModifier,
}: {
  dossierId: string;
  referent: ContactOption | null;
  contacts: ContactOption[];
  companyName: string | null;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'lecture' | 'choix' | 'creation'>('lecture');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nouveau, setNouveau] = useState({ firstName: '', lastName: '', position: '', email: '', phone: '' });

  const choisir = (contactId: string) => {
    setErreur(null);
    startTransition(async () => {
      const res = await designerReferent({ dossierId, contactId });
      if (!res.ok) return setErreur(res.error);
      setMode('lecture');
      router.refresh();
    });
  };

  const creer = () => {
    setErreur(null);
    if (!nouveau.firstName.trim() || !nouveau.lastName.trim()) {
      return setErreur('Le prénom et le nom sont nécessaires.');
    }
    startTransition(async () => {
      const res = await creerEtDesignerReferent({ dossierId, ...nouveau });
      if (!res.ok) return setErreur(res.error);
      setNouveau({ firstName: '', lastName: '', position: '', email: '', phone: '' });
      setMode('lecture');
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/25 dark:to-zinc-900 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-lg grid place-items-center bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
            <UserRound className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Référent du client</h2>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Destinataire de la convention, des devis et des factures.
            </p>
          </div>
        </div>

        {peutModifier && mode === 'lecture' && (
          <button
            type="button"
            onClick={() => setMode(contacts.length > 0 ? 'choix' : 'creation')}
            className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition"
          >
            {referent ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {referent ? 'Changer' : 'Désigner'}
          </button>
        )}
        {peutModifier && mode !== 'lecture' && (
          <button
            type="button"
            onClick={() => {
              setMode('lecture');
              setErreur(null);
            }}
            className="h-8 w-8 rounded-lg grid place-items-center text-zinc-500 hover:bg-white dark:hover:bg-zinc-800 transition"
            aria-label="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {mode === 'lecture' &&
        (referent ? (
          <div className="pl-11.5 space-y-1.5">
            <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
              {referent.firstName} {referent.lastName}
            </p>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              {referent.position ?? 'Fonction non renseignée'}
              {companyName && (
                <span className="inline-flex items-center gap-1.5 ml-2 text-zinc-500">
                  <Building2 className="w-3.5 h-3.5" />
                  {companyName}
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {referent.email ? (
                <a
                  href={`mailto:${referent.email}`}
                  className="h-8 px-2.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition"
                >
                  <Mail className="w-3.5 h-3.5 text-rose-500" /> {referent.email}
                </a>
              ) : (
                <span className="text-[12px] text-amber-600 dark:text-amber-400">
                  Aucun e-mail : les envois automatiques ne partiront pas.
                </span>
              )}
              {referent.phone && (
                <a
                  href={`tel:${referent.phone.replace(/\s+/g, '')}`}
                  className="h-8 px-2.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition tabular-nums"
                >
                  <Phone className="w-3.5 h-3.5 text-rose-500" /> {referent.phone}
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 pl-11.5">
            Aucun référent désigné.{' '}
            {companyName
              ? `Les documents partent pour l’instant au contact de ${companyName}.`
              : 'Ce dossier n’a pas d’entreprise cliente.'}
          </p>
        ))}

      {mode === 'choix' && (
        <div className="space-y-2">
          <ul className="space-y-1">
            {contacts.map((c) => {
              const actuel = c.id === referent?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => choisir(c.id)}
                    disabled={pending}
                    className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-60 ${
                      actuel ? 'bg-white dark:bg-zinc-900 ring-2 ring-rose-400' : 'hover:bg-white/70 dark:hover:bg-zinc-900/50'
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                      {[c.position, c.email, c.phone].filter(Boolean).join(' · ') || 'Aucune coordonnée'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('creation')}
              disabled={pending}
              className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white transition disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" /> Nouveau référent
            </button>
            {referent && (
              <button
                type="button"
                onClick={() => choisir('')}
                disabled={pending}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition disabled:opacity-60"
              >
                Retirer le référent
              </button>
            )}
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
          </div>
        </div>
      )}

      {mode === 'creation' && (
        <div className="space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={nouveau.firstName}
              onChange={(e) => setNouveau({ ...nouveau, firstName: e.target.value })}
              placeholder="Prénom"
              className={CHAMP}
            />
            <input
              value={nouveau.lastName}
              onChange={(e) => setNouveau({ ...nouveau, lastName: e.target.value })}
              placeholder="Nom"
              className={CHAMP}
            />
          </div>
          <input
            value={nouveau.position}
            onChange={(e) => setNouveau({ ...nouveau, position: e.target.value })}
            placeholder="Fonction (ex. Responsable formation)"
            className={CHAMP}
          />
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={nouveau.email}
              onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })}
              type="email"
              placeholder="E-mail"
              className={CHAMP}
            />
            <input
              value={nouveau.phone}
              onChange={(e) => setNouveau({ ...nouveau, phone: e.target.value })}
              placeholder="Téléphone"
              className={`${CHAMP} tabular-nums`}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={creer}
              disabled={pending}
              className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Enregistrer le référent
            </button>
            {contacts.length > 0 && (
              <button
                type="button"
                onClick={() => setMode('choix')}
                className="h-9 px-3 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition"
              >
                Choisir un contact existant
              </button>
            )}
          </div>
        </div>
      )}

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </section>
  );
}
