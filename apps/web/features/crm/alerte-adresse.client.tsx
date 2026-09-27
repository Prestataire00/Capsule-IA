'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { verifierAdresses } from './verifier-adresses.action';

/**
 * Alerte sous un champ e-mail : l'adresse est déjà utilisée par un stagiaire.
 * Lit le prénom et le nom dans le même formulaire, pour dire s'il s'agit de la
 * même personne. Ne bloque rien.
 */
export function AlerteAdresse({ champEmail = 'email', champPrenom = 'firstName', champNom = 'lastName' }: { champEmail?: string; champPrenom?: string; champNom?: string }) {
  const ancre = useRef<HTMLParagraphElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const form = ancre.current?.closest('form');
    if (!form) return;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const lire = (nom: string) => ((form.elements.namedItem(nom) as HTMLInputElement | null)?.value ?? '').trim();
    const verifier = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(async () => {
        const email = lire(champEmail);
        if (!email.includes('@')) return setMessage(null);
        const [r] = await verifierAdresses([{ email, prenom: lire(champPrenom), nom: lire(champNom) }]);
        setMessage(r ?? null);
      }, 450);
    };
    form.addEventListener('input', verifier);
    return () => {
      form.removeEventListener('input', verifier);
      clearTimeout(minuteur);
    };
  }, [champEmail, champPrenom, champNom]);

  return (
    <p ref={ancre} role="status" hidden={!message} className="mt-1.5 text-[12px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg px-2.5 py-1.5">
      <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
      {message}
    </p>
  );
}
