'use client';

import { useState, useTransition } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { forgetRoomIdentity, identifyInRoom } from './actions';

const MESSAGES: Record<string, string> = {
  room_email_invalid: 'Cette adresse e-mail n’est pas valide.',
  room_email_unknown: 'Aucun apprenant de cette séance n’a cette adresse. Vérifiez-la, ou demandez au formateur de vous faire signer.',
  room_email_ambiguous: 'Plusieurs apprenants partagent cette adresse : demandez au formateur de vous faire signer sur sa tablette.',
  room_pass_expired: 'Le délai est dépassé. Scannez à nouveau le QR code affiché à l’écran.',
  room_device_used:
    'Ce téléphone a déjà servi à émarger une autre personne sur cette demi-journée. Chaque apprenant émarge avec son propre téléphone.',
  room_not_expected: 'Vous n’êtes pas attendu(e) sur cette séance. Signalez-le au formateur.',
  attendance_sheet_finalized: 'Cette feuille de présence est clôturée.',
};

export function RoomIdentifyForm({
  sheetId,
  pass,
  formationTitle,
  halfDayLabel,
  organizationName,
  warning,
}: {
  sheetId: string;
  pass: string;
  formationTitle: string;
  halfDayLabel: string;
  organizationName: string;
  warning: string | null;
}) {
  const [email, setEmail] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <form
        className="w-full max-w-[400px] space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErreur(null);
          start(async () => {
            const r = await identifyInRoom({ sheetId, pass, email });
            if (r.ok) window.location.assign(r.path);
            else setErreur(MESSAGES[r.error] ?? 'L’identification a échoué. Réessayez ou demandez au formateur.');
          });
        }}
      >
        <div className="text-center space-y-2">
          <QrCode className="w-8 h-8 text-orange-500 dark:text-orange-400 mx-auto" aria-hidden />
          <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-orange-600 dark:text-orange-400">{organizationName}</p>
          <h1 className="text-[24px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">{formationTitle}</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Émargement · {halfDayLabel}</p>
        </div>

        {warning && (
          <p role="status" className="text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
            {warning}
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">Votre adresse e-mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-[16px] px-3 h-12 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition"
            placeholder="prenom.nom@exemple.fr"
          />
          <span className="block text-[12px] text-zinc-500">Celle que vous avez donnée à l’inscription. Ce téléphone s’en souviendra.</span>
        </label>

        {erreur && (
          <p role="alert" className="text-[13px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
            {erreur}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || email.trim().length === 0}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-40 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          Continuer vers la signature
        </button>

        {warning && (
          <button
            type="button"
            onClick={() => start(async () => forgetRoomIdentity())}
            className="w-full text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Ce n’est pas moi : oublier le profil enregistré
          </button>
        )}

        <p className="text-[11px] text-zinc-400 text-center">
          Votre e-mail sert uniquement à vous reconnaître sur la feuille de présence de {organizationName || 'l’organisme'}.
        </p>
      </form>
    </div>
  );
}
