'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { enregistrerReglage, retablirDefaut } from '@/features/emails/programmation-store';
import { estReglable } from '@/features/emails/programmation-envois';

/**
 * Régler les envois de tout l'organisme.
 *
 * La garde est explicite : une Server Action n'est pas protégée par l'écran qui
 * l'appelle, et couper les convocations de tout un organisme n'est pas un geste
 * que doit pouvoir faire n'importe quel membre.
 *
 * Le résultat repart dans l'URL plutôt qu'en console : un réglage refusé sans
 * message laisserait croire qu'il est enregistré.
 */

type Garde = { organizationId: string; userId: string } | { erreur: string };

async function garde(): Promise<Garde> {
  const me = await getCurrentMember();
  if (!me) return { erreur: 'Session expirée. Reconnectez-vous.' };
  if (can(me.role, 'settings') !== 'manage') {
    return { erreur: 'Seuls un propriétaire ou un administrateur peuvent régler les envois automatiques.' };
  }
  return { organizationId: me.organizationId, userId: me.userId };
}

function retour(params: { erreur?: string; regle?: string }): never {
  const q = new URLSearchParams();
  if (params.erreur) q.set('erreur', params.erreur);
  if (params.regle) q.set('regle', params.regle);
  const suffixe = q.toString();
  redirect(suffixe ? `/emails/automatiques?${suffixe}` : '/emails/automatiques');
}

export async function reglerEnvoi(formData: FormData): Promise<void> {
  const g = await garde();
  if ('erreur' in g) retour({ erreur: g.erreur });

  const kind = String(formData.get('kind') ?? '');
  if (!estReglable(kind)) retour({ erreur: `Type d’envoi inconnu : ${kind}` });

  // Une case décochée n'est pas transmise par le navigateur : son absence vaut
  // « coupé ». Le champ caché `coupable` évite de confondre « décoché » et
  // « pas affiché » pour les envois qui ne se coupent pas.
  const coupable = formData.get('coupable') === '1';
  const actif = coupable ? formData.get('actif') === 'on' : true;
  const delaiBrut = formData.get('delaiJours');
  const delaiJours = delaiBrut === null || delaiBrut === '' ? 0 : Number(delaiBrut);

  const r = await enregistrerReglage({
    organizationId: g.organizationId,
    kind,
    actif,
    delaiJours,
    parUtilisateur: g.userId,
  });
  if (!r.ok) retour({ erreur: r.erreur });

  revalidatePath('/emails/automatiques');
  retour({ regle: kind });
}

export async function remettreDefaut(formData: FormData): Promise<void> {
  const g = await garde();
  if ('erreur' in g) retour({ erreur: g.erreur });

  const kind = String(formData.get('kind') ?? '');
  if (!estReglable(kind)) retour({ erreur: `Type d’envoi inconnu : ${kind}` });

  const r = await retablirDefaut(g.organizationId, kind);
  if (!r.ok) retour({ erreur: r.erreur });

  revalidatePath('/emails/automatiques');
  retour({ regle: kind });
}
