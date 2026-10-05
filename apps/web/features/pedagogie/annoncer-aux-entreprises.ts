import 'server-only';
import { envoyerDepuisLOrganisme } from '@/features/sessions/visio';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { liensStagiairesReferentEmail } from '@/shared/lib/email/templates';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';
import { loadSession } from '@/features/sessions/load-session';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { lienStagiaire } from '@/features/questionnaire/lien-stagiaire';

/**
 * Un quiz ou un exercice vient d'être validé : chaque entreprise reçoit, en
 * un seul e-mail, le lien personnel de chacun de ses stagiaires. Le stagiaire
 * le fait sur une page seule. Une fois par exercice et par entreprise.
 */
export async function annoncerCoursAuxEntreprises(exerciseId: string): Promise<void> {
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return;
  const admin = supabaseAdmin();
  const { data: e } = await admin
    .schema('app')
    .from('exercises' as never)
    .select('organization_id, title, kind, session_id, dossier_id')
    .eq('id', exerciseId)
    .maybeSingle();
  const ex = e as unknown as { organization_id: string; title: string; kind: string | null; session_id: string | null; dossier_id: string | null } | null;
  // Le devoir se rend autrement (dépôt de fichier) : seuls les exercices en ligne sont annoncés.
  if (!ex || ex.kind === 'devoir') return;

  // Les stagiaires visés : ceux de la séance, sinon ceux du dossier.
  let stagiaires: Array<{ id: string; nom: string; dossierId: string }> = [];
  let formation: string | null = null;
  if (ex.session_id) {
    const loaded = await loadSession(admin, ex.session_id);
    formation = loaded?.formation?.title ?? null;
    stagiaires = (loaded?.learners ?? []).map((l) => ({ id: l.id, nom: `${l.first_name} ${l.last_name}`.trim(), dossierId: l.dossierId }));
  } else if (ex.dossier_id) {
    const { data: dl } = await admin
      .schema('app')
      .from('dossier_learners' as never)
      .select('learner:learners(id, first_name, last_name)')
      .eq('dossier_id', ex.dossier_id);
    stagiaires = ((dl ?? []) as unknown as Array<{ learner: { id: string; first_name: string; last_name: string } | null }>)
      .filter((r) => r.learner)
      .map((r) => ({ id: r.learner!.id, nom: `${r.learner!.first_name} ${r.learner!.last_name}`.trim(), dossierId: ex.dossier_id! }));
  }
  if (stagiaires.length === 0) return;

  const referents = await referentsDesDossiers(admin as never, stagiaires.map((s) => s.dossierId));
  const parReferent = new Map<string, { prenom: string; liste: Array<{ nom: string; lien: string }> }>();
  for (const s of stagiaires) {
    const ref = referents.get(s.dossierId);
    if (!ref) continue;
    const lien = await lienStagiaire(base, 'quiz', { learnerId: s.id, organizationId: ex.organization_id, dossierId: s.dossierId, cibleId: exerciseId });
    const entree = parReferent.get(ref.email) ?? { prenom: ref.prenom, liste: [] };
    entree.liste.push({ nom: s.nom, lien });
    parReferent.set(ref.email, entree);
  }

  const expediteur = await expediteurDeLOrganisme(admin as never, ex.organization_id);
  for (const [email, { prenom, liste }] of parReferent) {
    const tpl = liensStagiairesReferentEmail({
      prenom,
      objet: `« ${ex.title} » — un exercice pour vos stagiaires`,
      intro: `Le formateur a préparé « ${ex.title} »${formation ? ` pour la formation « ${formation} »` : ''}. Merci de transmettre à chacun de vos stagiaires son lien : il le fait en quelques minutes, sur son téléphone ou son ordinateur.`,
      stagiaires: liste,
      organisme: expediteur.nom,
      libelleLien: 'son exercice',
    });
    const r = await envoyerDepuisLOrganisme(admin as never, ex.organization_id, {
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      kind: 'cours_stagiaires',
      metadata: { exercise_id: exerciseId, stagiaires: liste.length },
      idempotencyKey: `cours_stagiaires:${exerciseId}:${email}`,
    });
    if (!r.ok && r.reason !== 'duplicate' && r.reason !== 'no_api_key') console.error('[cours] entreprise non prévenue', exerciseId, r.reason);
  }
}
