import { canManageSection } from '@/shared/lib/auth/require-access';
import type { Section } from '@/shared/lib/auth/permissions';

/**
 * Rend ses enfants uniquement si le membre connecté peut *gérer* la section
 * (niveau `manage`). Sert à masquer les boutons créer/éditer aux rôles en lecture.
 * Composant serveur async (à utiliser dans un Server Component).
 */
export async function ManageOnly({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  return (await canManageSection(section)) ? <>{children}</> : null;
}
