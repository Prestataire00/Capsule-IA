// « Programmation » a rejoint le pôle Emails : les règles personnalisées et les
// envois intégrés répondaient à la même question — « quand mes e-mails partent »
// — depuis deux entrées de menu différentes.
//
// Redirection conservée pour les liens et signets existants ; supprimable une
// fois qu'elle ne sert plus.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ProgrammationRedirect() {
  redirect('/emails/programmation');
}
