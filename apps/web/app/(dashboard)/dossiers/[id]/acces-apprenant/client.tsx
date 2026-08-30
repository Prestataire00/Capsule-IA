'use client';

import { useState, useTransition } from 'react';
import { Link2, Copy, Check, Mail, Loader2, AlertCircle, Sparkles, FileBadge, ShieldOff } from 'lucide-react';
import {
  generateApprenantLink,
  sendApprenantLinkEmail,
  sendWelcomePacketEmail,
  revokeApprenantLinks,
} from './actions';

type LinkState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      url: string;
      qrDataUrl: string;
      expiresAt: string;
      learnerEmail: string | null;
      learnerName: string;
    };

type EmailState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; emailId: string }
  | { status: 'error'; message: string };

type WelcomeState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'error'; message: string };

export function AccesApprenantClient({ dossierId }: { dossierId: string }) {
  const [link, setLink] = useState<LinkState>({ status: 'idle' });
  const [email, setEmail] = useState<EmailState>({ status: 'idle' });
  const [welcome, setWelcome] = useState<WelcomeState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState<
    { status: 'idle' } | { status: 'confirm' } | { status: 'working' } | { status: 'done' } | { status: 'error'; message: string }
  >({ status: 'idle' });

  const handleRevoke = () => {
    setRevoke({ status: 'working' });
    startTransition(async () => {
      const result = await revokeApprenantLinks(dossierId);
      setRevoke(result.ok ? { status: 'done' } : { status: 'error', message: result.error });
    });
  };
  const [pending, startTransition] = useTransition();

  const handleSendWelcomePacket = () => {
    setWelcome({ status: 'sending' });
    startTransition(async () => {
      const result = await sendWelcomePacketEmail(dossierId);
      if (result.ok) {
        setWelcome({ status: 'sent' });
      } else {
        const msg =
          result.error === 'learner_email_missing'
            ? "L'apprenant n'a pas d'email renseigné dans sa fiche."
            : result.error === 'dossier_not_found'
            ? 'Dossier introuvable.'
            : result.error === 'no_api_key'
            ? 'RESEND_API_KEY non configurée côté Railway.'
            : `Envoi échoué (${result.error}).`;
        setWelcome({ status: 'error', message: msg });
      }
    });
  };

  const handleGenerate = () => {
    setLink({ status: 'loading' });
    setEmail({ status: 'idle' });
    startTransition(async () => {
      const result = await generateApprenantLink(dossierId);
      if (result.ok) {
        setLink({
          status: 'ready',
          url: result.url,
          qrDataUrl: result.qrDataUrl,
          expiresAt: result.expiresAt,
          learnerEmail: result.learnerEmail,
          learnerName: result.learnerName,
        });
      } else {
        const msg =
          result.error === 'dossier_not_found'
            ? "Dossier introuvable. Vérifie que la migration 0028 est bien appliquée et que ce dossier existe en DB."
            : result.error === 'public_app_url_missing'
            ? 'PUBLIC_APP_URL non configurée côté Railway.'
            : `Erreur : ${result.error}`;
        setLink({ status: 'error', message: msg });
      }
    });
  };

  const handleCopy = async () => {
    if (link.status !== 'ready') return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = () => {
    if (link.status !== 'ready' || !link.learnerEmail) return;
    setEmail({ status: 'sending' });
    startTransition(async () => {
      const result = await sendApprenantLinkEmail({
        url: link.url,
        learnerEmail: link.learnerEmail!,
        learnerName: link.learnerName,
      });
      if (result.ok) {
        setEmail({ status: 'sent', emailId: result.emailId });
      } else {
        const msg =
          result.error === 'no_api_key'
            ? 'RESEND_API_KEY non configurée.'
            : 'Échec d\'envoi via Resend. Vérifie EMAIL_FROM et le domaine vérifié.';
        setEmail({ status: 'error', message: msg });
      }
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm p-6">
      {link.status === 'idle' && (
        <div className="text-center py-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 flex items-center justify-center mb-4 shadow-sm">
            <Link2 className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-5">
            Aucun lien généré pour ce dossier.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg transition shadow-sm inline-flex items-center gap-2 disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {pending ? 'Génération…' : 'Générer le lien apprenant'}
          </button>
        </div>
      )}

      {link.status === 'loading' && (
        <div className="text-center py-10 text-zinc-500 dark:text-zinc-400 text-[13px] inline-flex items-center gap-2 w-full justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Génération du lien signé…
        </div>
      )}

      {link.status === 'error' && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] text-red-900 dark:text-red-200 font-medium mb-1">Impossible de générer le lien</p>
            <p className="text-[12px] text-red-700 dark:text-red-300">{link.message}</p>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-[12px] text-red-700 dark:text-red-300 underline mt-3 inline-block hover:no-underline"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {link.status === 'ready' && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-[12px] text-emerald-900 dark:text-emerald-200">
              <p className="font-medium">Lien généré pour {link.learnerName}</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80 mt-0.5">
                Expire le {new Date(link.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold mb-2 block">
                URL personnelle signée
              </label>
              <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={link.url}
                readOnly
                className="flex-1 font-mono text-[11px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 transition"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[12px] font-medium px-3 py-2 rounded-lg transition inline-flex items-center gap-1.5 flex-shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </button>
              </div>
            </div>

            <div className="text-center">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold mb-2 block">
                QR code
              </label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={link.qrDataUrl}
                alt="QR code de l'URL apprenant"
                className="w-32 h-32 bg-white p-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800 shadow-sm mx-auto"
              />
              <p className="text-[10px] text-zinc-400 mt-1.5">À scanner avec le téléphone</p>
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold mb-2 block">
              Envoyer par email
            </label>

            {!link.learnerEmail ? (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                L&apos;apprenant n&apos;a pas d&apos;email renseigné. Ajoute-le dans sa fiche pour activer l&apos;envoi.
              </p>
            ) : email.status === 'sent' ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-[12px] text-emerald-900 dark:text-emerald-200">
                  Email envoyé à <strong>{link.learnerEmail}</strong>
                </p>
              </div>
            ) : email.status === 'error' ? (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-900 dark:text-red-200">{email.message}</p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3 bg-zinc-50/60 dark:bg-zinc-950/40 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
                <div className="min-w-0">
                  <p className="text-[12px] text-zinc-600 dark:text-zinc-400">Destinataire</p>
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{link.learnerEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={email.status === 'sending' || pending}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-medium px-3 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2 flex-shrink-0 disabled:opacity-40"
                >
                  {email.status === 'sending' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  {email.status === 'sending' ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            )}
          </div>

          {link.learnerEmail && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold mb-2 block">
                Dossier d'entrée
              </label>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
                Email récap formation (dates, durée, modalité, formateur) + lien convention PDF + lien espace.
              </p>

              {welcome.status === 'sent' ? (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-[12px] text-emerald-900 dark:text-emerald-200">
                    Dossier d'entrée envoyé à <strong>{link.learnerEmail}</strong>
                  </p>
                </div>
              ) : welcome.status === 'error' ? (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-900 dark:text-red-200">{welcome.message}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendWelcomePacket}
                  disabled={welcome.status === 'sending' || pending}
                  className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-[12px] font-medium px-3 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2 disabled:opacity-40"
                >
                  {welcome.status === 'sending' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileBadge className="w-3.5 h-3.5" />
                  )}
                  {welcome.status === 'sending' ? 'Envoi…' : "Envoyer le dossier d'entrée"}
                </button>
              )}
            </div>
          )}

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3">
            <button
              type="button"
              onClick={handleGenerate}
              className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition underline-offset-2 hover:underline"
            >
              Régénérer un nouveau lien
            </button>

            {revoke.status === 'done' ? (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-emerald-900 dark:text-emerald-200">
                  Liens révoqués. Ceux déjà envoyés ne fonctionnent plus. Régénérez un lien pour redonner
                  l&apos;accès à l&apos;apprenant.
                </p>
              </div>
            ) : revoke.status === 'error' ? (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-900 dark:text-red-200">{revoke.message}</p>
              </div>
            ) : revoke.status === 'confirm' ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg space-y-2">
                <p className="text-[12px] text-amber-900 dark:text-amber-200">
                  Tous les liens déjà envoyés pour ce dossier cesseront de fonctionner : espace apprenant,
                  questionnaires, satisfaction, signature de document.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={pending}
                    className="bg-red-600 hover:bg-red-700 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm disabled:opacity-40"
                  >
                    Révoquer
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevoke({ status: 'idle' })}
                    className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRevoke({ status: 'confirm' })}
                disabled={revoke.status === 'working' || pending}
                className="text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                {revoke.status === 'working' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ShieldOff className="w-3 h-3" />
                )}
                Révoquer les liens déjà envoyés
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
