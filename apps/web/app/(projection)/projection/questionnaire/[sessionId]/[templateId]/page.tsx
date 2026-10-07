// ARCHETYPE: command — QR d'un questionnaire de la séance, projeté en salle.
import { notFound } from 'next/navigation';
import { accessibleSession } from '@/features/attendance/access';
import { modeleProjetable } from '@/features/questionnaire/questionnaire-salle';
import { ProjecteurSatisfaction } from '../../../satisfaction/[sessionId]/projecteur.client';

export const dynamic = 'force-dynamic';

export default async function ProjectionQuestionnairePage({ params }: { params: { sessionId: string; templateId: string } }) {
  const acces = await accessibleSession(params.sessionId);
  if (!acces.ok) notFound();
  const projetable = await modeleProjetable(params.sessionId, params.templateId);
  if (!projetable) notFound();
  return (
    <ProjecteurSatisfaction
      sessionId={params.sessionId}
      titre={projetable.modele.title}
      surtitre="Questionnaire"
      consigne="Scannez, donnez votre nom, puis répondez sur votre téléphone."
      source={`/api/questionnaire-salle/${params.sessionId}/${params.templateId}/live`}
    />
  );
}
