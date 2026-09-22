import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Grille d'émargement d'un dossier : les demi-journées en colonnes, les
 * stagiaires en lignes.
 *
 * L'écran existant n'offrait qu'une feuille à la fois — une page par
 * demi-journée. Sur une formation de six semaines, suivre l'assiduité de six
 * stagiaires demandait soixante allers-retours. C'est la vue d'ensemble qui
 * manquait, pas les gestes : « tous présents », l'envoi des liens, la signature
 * et la clôture existent déjà comme actions.
 *
 * Quatre requêtes, quelles que soient la durée de la formation et la taille du
 * groupe : les séances, leurs feuilles, les stagiaires du dossier, les
 * signatures. Une requête par séance aurait rendu l'écran inutilisable dès la
 * deuxième semaine.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type Colonne = {
  readonly sheetId: string;
  readonly sessionId: string;
  readonly jour: string;
  readonly halfDay: string;
  readonly debut: string;
  readonly fin: string;
  readonly finalisee: boolean;
};

export type CaseEmargement = {
  readonly statut: string | null;
  readonly signeA: string | null;
  readonly imagePath: string | null;
};

export type LigneStagiaire = {
  readonly id: string;
  readonly nom: string;
  readonly email: string | null;
  /** Indexé par `sheetId`. */
  readonly cases: Record<string, CaseEmargement>;
};

export type GrilleDossier = {
  readonly colonnes: Colonne[];
  readonly lignes: LigneStagiaire[];
  /** URL signées des signatures, indexées `learnerId|sheetId`. Dix minutes. */
  readonly vignettes: Record<string, string>;
  /** Formateurs du dossier : ce sont eux qui signent la feuille. */
  readonly formateurs: { id: string; nom: string }[];
};

export async function loadGrilleDossier(sb: Client, dossierId: string): Promise<GrilleDossier> {
  const vide: GrilleDossier = { colonnes: [], lignes: [], vignettes: {}, formateurs: [] };

  const { data: seancesRows, error: erreurSeances } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at, status')
    .eq('dossier_id', dossierId)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true });
  if (erreurSeances) {
    console.error('[émargement] séances illisibles', erreurSeances.message);
    return vide;
  }
  const seances = (seancesRows ?? []) as Array<{ id: string; starts_at: string; ends_at: string }>;
  if (seances.length === 0) return vide;

  const parSeance = new Map(seances.map((s) => [s.id, s]));
  const seanceIds = seances.map((s) => s.id);

  const { data: feuillesRows } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, half_day, status')
    .in('session_id', seanceIds);
  const feuilles = (feuillesRows ?? []) as Array<{
    id: string;
    session_id: string;
    half_day: string;
    status: string;
  }>;

  const ORDRE: Record<string, number> = { morning: 0, full: 1, afternoon: 2, evening: 3 };
  const colonnes: Colonne[] = feuilles
    .map((f) => {
      const s = parSeance.get(f.session_id)!;
      return {
        sheetId: f.id,
        sessionId: f.session_id,
        jour: s.starts_at.slice(0, 10),
        halfDay: f.half_day,
        debut: s.starts_at,
        fin: s.ends_at,
        finalisee: f.status === 'finalized',
      };
    })
    .sort((a, b) => a.jour.localeCompare(b.jour) || (ORDRE[a.halfDay] ?? 9) - (ORDRE[b.halfDay] ?? 9));

  // Stagiaires du dossier : la même règle que les feuilles et l'espace
  // apprenant — le groupe s'il existe, le titulaire sinon (0186).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idsRows } = await (sb as any)
    .schema('app')
    .rpc('dossier_apprenants', { p_dossier_id: dossierId });
  const learnerIds = [...new Set(((idsRows ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id))];
  if (learnerIds.length === 0) return { ...vide, colonnes };

  const [{ data: gensRows }, { data: signaturesRows }] = await Promise.all([
    sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds),
    feuilles.length > 0
      ? sb
          .schema('app')
          .from('attendance_signatures')
          .select('attendance_sheet_id, learner_id, status, signed_at, signature_image_path')
          .in(
            'attendance_sheet_id',
            feuilles.map((f) => f.id),
          )
          .eq('participant_kind', 'learner')
      : Promise.resolve({ data: [] }),
  ]);

  const signatures = (signaturesRows ?? []) as Array<{
    attendance_sheet_id: string;
    learner_id: string | null;
    status: string | null;
    signed_at: string | null;
    signature_image_path: string | null;
  }>;
  const parCle = new Map<string, CaseEmargement>();
  for (const s of signatures) {
    if (!s.learner_id) continue;
    parCle.set(`${s.learner_id}:${s.attendance_sheet_id}`, {
      statut: s.status,
      signeA: s.signed_at,
      imagePath: s.signature_image_path,
    });
  }

  const lignes: LigneStagiaire[] = (
    (gensRows ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string | null }>
  )
    .map((l) => ({
      id: l.id,
      nom: `${l.first_name} ${l.last_name}`.trim(),
      email: l.email,
      cases: Object.fromEntries(
        colonnes
          .map((c) => [c.sheetId, parCle.get(`${l.id}:${c.sheetId}`)] as const)
          .filter((e): e is [string, CaseEmargement] => Boolean(e[1])),
      ),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  // Vignettes de signature : URL signées de dix minutes, comme l'écran d'une
  // séance. Le bucket est privé — une URL publique exposerait la signature
  // manuscrite de chaque stagiaire.
  const vignettes: Record<string, string> = {};
  const chemins = signatures
    .filter((s) => s.learner_id && s.signature_image_path)
    .map((s) => ({ cle: `${s.learner_id}|${s.attendance_sheet_id}`, chemin: s.signature_image_path! }));
  if (chemins.length > 0) {
    const { data } = await sb.storage.from('signatures').createSignedUrls(
      chemins.map((c) => c.chemin),
      600,
    );
    const parChemin = new Map(((data ?? []) as Array<{ path: string; signedUrl: string }>).map((d) => [d.path, d.signedUrl]));
    for (const c of chemins) {
      const url = parChemin.get(c.chemin);
      if (url) vignettes[c.cle] = url;
    }
  }

  // Formateurs du dossier : « signer formateur » les marque présents sur la
  // demi-journée, ce qui vaut sa signature sur la feuille.
  const { data: liens } = await sb
    .schema('app')
    .from('dossier_trainers')
    .select('trainer_id')
    .eq('dossier_id', dossierId);
  const trainerIds = ((liens ?? []) as Array<{ trainer_id: string }>).map((l) => l.trainer_id);
  const { data: formateursRows } = trainerIds.length
    ? await sb.schema('app').from('trainers').select('id, first_name, last_name').in('id', trainerIds)
    : { data: [] };
  const formateurs = ((formateursRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map(
    (t) => ({ id: t.id, nom: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Formateur' }),
  );

  return { colonnes, lignes, vignettes, formateurs };
}
