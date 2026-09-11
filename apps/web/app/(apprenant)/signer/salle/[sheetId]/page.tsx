// ARCHETYPE: workflow (mobile) — l'apprenant a scanné le QR projeté en salle.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AlertCircle, Lock, RefreshCw, Smartphone } from 'lucide-react';
import { env } from '@/env.mjs';
import { checkRoomCode, readLearnerCookie, roomPass } from '@/features/attendance/room-code';
import { DEVICE_COOKIE, LEARNER_COOKIE, admitInRoom, loadRoomSheet } from '@/features/attendance/room';
import { RoomIdentifyForm } from './identify-form';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };

function Message({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-[380px] text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
          {icon}
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{title}</h1>
        <div className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * Scan du QR projeté. Le code doit dater de moins de vingt secondes : c'est ce
 * qui prouve la présence dans la salle. Un apprenant déjà reconnu sur ce
 * téléphone va droit à la signature ; sinon il s'identifie par son e-mail.
 */
export default async function SalleScanPage({ params, searchParams }: { params: { sheetId: string }; searchParams: { c?: string } }) {
  const now = Date.now();
  if (!UUID.test(params.sheetId) || !checkRoomCode(env.TOKEN_SIGNING_KEY, params.sheetId, searchParams.c, now)) {
    return (
      <Message icon={<RefreshCw className="w-8 h-8" />} title="QR code expiré">
        Le code affiché par votre formateur change toutes les dix secondes. Scannez à nouveau celui qui est à l’écran.
      </Message>
    );
  }

  const sheet = await loadRoomSheet(params.sheetId);
  if (!sheet) {
    return (
      <Message icon={<AlertCircle className="w-8 h-8" />} title="Émargement introuvable">
        Cette feuille de présence n’existe plus.
      </Message>
    );
  }
  if (sheet.finalized) {
    return (
      <Message icon={<Lock className="w-8 h-8" />} title="Feuille clôturée">
        Cette feuille de présence a été clôturée : elle ne peut plus être signée.
      </Message>
    );
  }

  const jar = cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  const learnerId = readLearnerCookie(env.TOKEN_SIGNING_KEY, jar.get(LEARNER_COOKIE)?.value, now);
  let avertissement: string | null = null;
  if (deviceId && UUID.test(deviceId) && learnerId) {
    const r = await admitInRoom({ sheet, learnerId, deviceId });
    if (r.ok) redirect(r.path);
    if (r.error === 'room_device_used') {
      return (
        <Message icon={<Smartphone className="w-8 h-8" />} title="Téléphone déjà utilisé">
          Ce téléphone a déjà servi à émarger une autre personne sur cette demi-journée. Chaque apprenant émarge avec son propre
          téléphone ; sans téléphone, signalez-vous au formateur, qui vous fera signer sur sa tablette.
        </Message>
      );
    }
    if (r.error === 'room_not_expected') avertissement = 'Le profil enregistré sur ce téléphone n’est pas attendu sur cette séance.';
  }

  return (
    <RoomIdentifyForm
      sheetId={sheet.id}
      pass={roomPass(env.TOKEN_SIGNING_KEY, sheet.id, now)}
      formationTitle={sheet.formationTitle}
      halfDayLabel={HALF_DAY[sheet.halfDay] ?? 'Journée'}
      organizationName={sheet.organizationName}
      warning={avertissement}
    />
  );
}
