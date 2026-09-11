import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from './current-member';

/**
 * Où doit atterrir un utilisateur connecté ?
 *
 * Deux identités coexistent et ne se recouvrent pas : **membre** de l'organisme
 * (table `app.members`, avec un rôle) et **formateur** (table `app.trainers`).
 * Une même personne peut être les deux — c'est le cas des formateurs internes.
 *
 * La connexion renvoyait tout le monde vers `/`, l'espace de l'organisme. Un
 * formateur qui n'est que formateur y arrivait donc sur une coquille
 * d'administration vide, sans comprendre pourquoi (audit CAP-29).
 */
export type Landing = '/' | '/formateur';

async function ficheRattachee(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('trainers')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[landing] lecture des fiches formateur échouée', error.message);
    return false;
  }
  return data !== null;
}

/**
 * Formateur = une fiche rattachée au compte. Faute de rattachement, on relie
 * les fiches libres portant exactement l'e-mail du compte — la règle de
 * `link_my_trainer_rows`, qui ne jouait jusqu'ici qu'à l'entrée de l'espace
 * formateur : un formateur qui se connectait par la page de connexion était
 * refusé avant d'y arriver.
 */
export async function isTrainer(userId: string): Promise<boolean> {
  if (await ficheRattachee(userId)) return true;
  const admin = supabaseAdmin();
  const { data: compte } = await admin.auth.admin.getUserById(userId);
  const email = compte?.user?.email?.trim().toLowerCase();
  if (!email) return false;
  const { data: reliees, error } = await admin
    .schema('app')
    .from('trainers')
    .update({ user_id: userId } as never)
    .eq('email', email)
    .is('user_id', null)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[landing] rattachement par e-mail échoué', error.message);
    return false;
  }
  return (reliees ?? []).length > 0;
}

/**
 * `/` pour un membre de l'organisme — y compris s'il est aussi formateur, ses
 * droits internes primant. `/formateur` pour un formateur sans rôle interne.
 * `null` quand l'utilisateur n'est ni l'un ni l'autre : il n'a rien à faire ici.
 */
export async function resolveLanding(userId: string): Promise<Landing | null> {
  const membre = await getCurrentMember();
  if (membre) return '/';
  return (await isTrainer(userId)) ? '/formateur' : null;
}
