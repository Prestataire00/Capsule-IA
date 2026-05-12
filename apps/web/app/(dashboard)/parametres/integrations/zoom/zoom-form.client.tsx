'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw, KeyRound } from 'lucide-react';
import {
  connectZoomS2s,
  testZoomConnectionFromStored,
  disconnectZoomS2s,
} from './actions';

export type ZoomStatus = {
  configured: boolean;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'error' | null;
  lastTestError: string | null;
};

export function ZoomS2sForm({ initialStatus }: { initialStatus: ZoomStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [form, setForm] = useState({ accountId: '', clientId: '', clientSecret: '' });
  const [feedback, setFeedback] = useState<
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const r = await connectZoomS2s(form);
      if (r.ok) {
        setFeedback({ kind: 'success', message: `Connecté en tant que ${r.accountEmail}` });
        setStatus({
          configured: true,
          lastTestAt: new Date().toISOString(),
          lastTestStatus: 'success',
          lastTestError: null,
        });
        setForm({ accountId: '', clientId: '', clientSecret: '' });
      } else {
        setFeedback({ kind: 'error', message: r.error });
      }
    });
  };

  const onTest = () => {
    setFeedback(null);
    startTransition(async () => {
      const r = await testZoomConnectionFromStored();
      if (r.ok) {
        setFeedback({ kind: 'success', message: `Connexion OK — ${r.accountEmail}` });
        setStatus((s) => ({ ...s, lastTestAt: new Date().toISOString(), lastTestStatus: 'success', lastTestError: null }));
      } else {
        setFeedback({ kind: 'error', message: r.error });
        setStatus((s) => ({ ...s, lastTestAt: new Date().toISOString(), lastTestStatus: 'error', lastTestError: r.error }));
      }
    });
  };

  const onDisconnect = () => {
    if (!confirm('Déconnecter Zoom S2S ? Les imports auto ne se feront plus.')) return;
    setFeedback(null);
    startTransition(async () => {
      const r = await disconnectZoomS2s();
      if (r.ok) {
        setStatus({ configured: false, lastTestAt: null, lastTestStatus: null, lastTestError: null });
        setFeedback({ kind: 'success', message: 'Déconnecté.' });
      } else {
        setFeedback({ kind: 'error', message: r.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      {status.configured && (
        <section className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">
                  Zoom S2S configuré
                </p>
                {status.lastTestAt && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                    Dernier test : {new Date(status.lastTestAt).toLocaleString('fr-FR')} ·{' '}
                    {status.lastTestStatus === 'success' ? '✅' : '❌'}{' '}
                    {status.lastTestError ? <span className="font-mono">({status.lastTestError})</span> : null}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onTest}
                disabled={pending}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium px-3 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/50 transition disabled:opacity-60"
              >
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Tester
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                disabled={pending}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-[12px] font-medium px-3 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-60"
              >
                <Trash2 className="w-3 h-3" />
                Déconnecter
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-3.5 h-3.5 text-violet-500" />
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {status.configured ? 'Mettre à jour les credentials' : 'Connecter Zoom Server-to-Server'}
          </p>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-4">
          Créez une app S2S OAuth sur{' '}
          <a
            href="https://marketplace.zoom.us/develop/create"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-violet-600 dark:text-violet-400"
          >
            marketplace.zoom.us
          </a>{' '}
          avec scopes <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">meeting:read:past_meeting:admin</code> et{' '}
          <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
            meeting:read:list_past_meeting_participants:admin
          </code>
          .
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          {(['accountId', 'clientId', 'clientSecret'] as const).map((field) => (
            <div key={field}>
              <label htmlFor={field} className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                {field === 'accountId' ? 'Account ID' : field === 'clientId' ? 'Client ID' : 'Client Secret'}
              </label>
              <input
                id={field}
                type={field === 'clientSecret' ? 'password' : 'text'}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                required
                disabled={pending}
                className="block w-full text-[12px] font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-medium px-3 py-1.5 rounded disabled:opacity-60 transition"
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            {status.configured ? 'Remplacer' : 'Connecter'}
          </button>
        </form>
      </section>

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg p-3 border ${
            feedback.kind === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-900/40'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200/60 dark:border-red-900/40'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          )}
          <p
            className={`text-[12px] font-mono break-all ${
              feedback.kind === 'success'
                ? 'text-emerald-900 dark:text-emerald-200'
                : 'text-red-900 dark:text-red-200'
            }`}
          >
            {feedback.message}
          </p>
        </div>
      )}
    </div>
  );
}
