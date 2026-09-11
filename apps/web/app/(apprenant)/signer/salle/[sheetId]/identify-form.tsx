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
          <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
            <QrCode className="w-7 h-7" aria-hidden />
          </div>
          <p className="text-[12px] uppercase tracking-wider text-zinc-500">{organizationName}</p>
          <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{formationTitle}</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Émargement · {halfDayLabel}</p>
        </div>

        {warning && (
          <p role="status" className="text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
            {warning}
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">Votre adresse e-mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-[16px] px-3 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
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
          className="w-full bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-medium py-3 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-40 shadow-sm"
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
