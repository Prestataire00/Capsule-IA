// ARCHETYPE: command — QR code d'émargement projeté en salle, suivi en direct.
import { notFound } from 'next/navigation';
import { accessibleSheet } from '@/features/attendance/access';
import { loadRoomSheet } from '@/features/attendance/room';
import { RoomProjector } from './room-projector';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };

export default async function ProjectionPage({ params }: { params: { sheetId: string } }) {
  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) notFound();
  const sheet = await loadRoomSheet(params.sheetId);
  if (!sheet) notFound();

  return <RoomProjector sheetId={sheet.id} title={sheet.formationTitle} halfDayLabel={HALF_DAY[sheet.halfDay] ?? 'Journée'} />;
}
