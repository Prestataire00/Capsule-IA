// ARCHETYPE: workflow client
// Flow d'enrollment MFA TOTP en 2 étapes :
//   1. enrollMfaAction → QR code affiché + secret
//   2. User entre le code 6 chiffres → verifyMfaAction
//   3. Success → revalidate page

'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Loader2, ShieldCheck, Copy, Check } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { enrollMfaAction, verifyMfaAction } from '../actions';

type EnrollState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'enrolled'; factorId: string; qrCode: string; secret: string }
  | { kind: 'error'; message: string };

export function EnrollFlow() {
  const [state, setState] = useState<EnrollState>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleStart = () => {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const result = await enrollMfaAction();
      if (result.ok) {
        setState({ kind: 'enrolled', factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
      } else {
        setState({ kind: 'error', message: result.error });
      }
    });
  };

  const handleVerify = () => {
    if (state.kind !== 'enrolled') return;
    setVerifyErr(null);
    startTransition(async () => {
      const result = await verifyMfaAction({ factorId: state.factorId, code });
      if (result.ok) {
        // Page sera revalidate → re-render avec MFA activé
        window.location.reload();
      } else {
        setVerifyErr(result.error);
      }
    });
  };

  const handleCopySecret = async () => {
    if (state.kind !== 'enrolled') return;
    await navigator.clipboard.writeText(state.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (state.kind === 'idle') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
          Cliquez ci-dessous pour générer un QR code à scanner avec votre application d'authentification.
        </p>
        <Button onClick={handleStart} disabled={pending}>
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Démarrer l'activation MFA
        </Button>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 text-[13px] text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Génération du secret TOTP…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-red-600 dark:text-red-400">Erreur : {state.message}</p>
        <Button onClick={handleStart} variant="secondary">
          Réessayer
        </Button>
      </div>
    );
  }

  // state.kind === 'enrolled'
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.qrCode}
            alt="QR code MFA"
            className="w-44 h-44 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white"
          />
          <div className="space-y-3">
            <div>
              <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                1. Scannez le QR avec votre app d'authentification
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Google Authenticator, 1Password, Authy…
              </p>
            </div>
            <div>
              <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mb-1">
                Ou entrez ce secret manuellement :
              </p>
              <div className="flex items-center gap-2">
                <code className="text-[12px] font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded select-all">
                  {state.secret}
                </code>
                <button
                  onClick={handleCopySecret}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  aria-label="Copier le secret"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
          2. Entrez le code à 6 chiffres affiché dans votre app
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="font-mono text-[15px] tracking-widest text-center w-32 h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            autoFocus
          />
          <Button onClick={handleVerify} disabled={pending || code.length !== 6}>
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <ShieldCheck className="w-3.5 h-3.5" />
            Activer
          </Button>
        </div>
        {verifyErr && (
          <p className="text-[12px] text-red-600 dark:text-red-400">
            Code invalide ou expiré. Vérifiez l'heure de votre appareil et réessayez.
          </p>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        ⚠ V1 : pas de codes de récupération. Si vous perdez l'accès à votre app TOTP, contactez un owner pour réinitialiser. Recovery codes prévus V1.5.
      </p>
    </div>
  );
}
