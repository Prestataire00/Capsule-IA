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
 * Formateur = une fiche rattachée au compte. Faute de rattachement, la fiche
 * qui porte l'e-mail du compte lui est reliée — y compris si elle pointait
 * vers un autre compte (ancien compte, adresse corrigée sur la fiche) : l'e-mail
 * de la fiche est la clé d'accès affichée à l'organisme, c'est lui qui fait foi.
 *
 * Seulement pour une adresse confirmée (lien d'invitation, de connexion ou de
 * réinitialisation ouvert) : sinon, créer un compte à l'adresse d'un formateur
 * suffirait à prendre sa fiche. La colonne `email` est en `citext`.
 */
export async function isTrainer(userId: string): Promise<boolean> {
  if (await ficheRattachee(userId)) return true;
  const admin = supabaseAdmin();
  const { data: compte } = await admin.auth.admin.getUserById(userId);
  const email = compte?.user?.email?.trim().toLowerCase();
  if (!email || !compte?.user?.email_confirmed_at) return false;
  const { data: reliees, error } = await admin
    .schema('app')
    .from('trainers')
    .update({ user_id: userId } as never)
    .eq('email', email)
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
