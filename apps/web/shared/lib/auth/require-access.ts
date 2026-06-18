import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentMember } from './current-member';
import { can, type Access, type Section } from './permissions';

/**
 * Garde de page : redirige vers l'accueil si le membre connecté n'a pas au moins
 * le niveau requis sur la section. La RLS reste le garde-fou en base.
 */
export async function requireAccess(section: Section, min: Access = 'read'): Promise<void> {
  const me = await getCurrentMember();
  const level = can(me?.role, section);
  const ok = min === 'manage' ? level === 'manage' : level !== 'none';
  if (!ok) redirect('/');
}
