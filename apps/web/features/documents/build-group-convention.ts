import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { buildConventionInput } from './build-convention-input';
import type { ConventionInput } from './generate-convention-pdf';

/**
 * Convention groupée : une entreprise, une séance, tous ses salariés.
 *
 * Une convention se génère par dossier, et un dossier ne porte qu'un apprenant.
 * Une entreprise qui inscrit cinq salariés recevait donc **cinq conventions**,
 * là où elle en attend une listant les cinq. C'est l'écart relevé le 2026-09-03
 * en reprenant les évolutions de RFC (CAP-32).
 *
 * Le document reprend le dossier du premier salarié comme socle — mêmes
 * formation, dates et conditions, puisqu'il s'agit de la même séance — et lui
 * substitue la liste des participants, l'effectif et le montant cumulé.
 *
 * Aucune modification du modèle : le document est rattaché au dossier socle et
 * porte en métadonnées la séance, l'entreprise et les dossiers couverts.
 */
export type GroupConvention = {
  readonly companyId: string;
  readonly companyName: string;
  readonly dossierIds: string[];
  readonly input: ConventionInput;
  readonly organizationId: string;
  /** Dossier servant de socle au document généré. */
  readonly anchorDossierId: string;
};

type DossierRow = {
  id: string;
  company_id: string | null;
  total_amount_cents: number | null;
  total_hours: number | string | null;
  learner: { first_name: string; last_name: string; email: string | null; birth_date: string | null } | null;
  company: { name: string } | null;
};

const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Dossiers d'une séance : rattachement direct ou table de liaison. */
async function dossiersDeLaSeance(sessionId: string): Promise<{ organizationId: string; ids: string[] } | null> {
  const sb = supabaseAdmin();
  const { data: sessionData } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, dossier_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sessionData) return null;
  const session = sessionData as unknown as { organization_id: string; dossier_id: string | null };

  const { data: liens } = await sb
    .schema('app')
    .from('session_dossiers')
    .select('dossier_id')
    .eq('session_id', sessionId);

  const ids = [
    ...new Set(
      [session.dossier_id, ...((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  return { organizationId: session.organization_id, ids };
}

/**
 * Une convention par entreprise cliente de la séance.
 *
 * Les particuliers sont écartés : ils n'ont pas d'entreprise, et leur convention
 * individuelle reste la bonne réponse. Une entreprise n'ayant qu'un seul salarié
 * inscrit est écartée aussi — sa convention individuelle suffit, un document
 * « groupé » à un participant n'apporterait rien.
 */
export async function buildGroupConventions(sessionId: string): Promise<GroupConvention[]> {
  const seance = await dossiersDeLaSeance(sessionId);
  if (!seance || seance.ids.length === 0) return [];

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, company_id, total_amount_cents, total_hours, learner:learners(first_name, last_name, email, birth_date), company:companies(name)',
    )
    .eq('organization_id', seance.organizationId)
    .is('deleted_at', null)
    .in('id', seance.ids);
  if (error) {
    console.error('[convention-groupee] lecture des dossiers échouée', error.message);
    return [];
  }

  const parEntreprise = new Map<string, DossierRow[]>();
  for (const d of (data ?? []) as unknown as DossierRow[]) {
    if (!d.company_id) continue;
    parEntreprise.set(d.company_id, [...(parEntreprise.get(d.company_id) ?? []), d]);
  }

  const conventions: GroupConvention[] = [];

  for (const [companyId, lignes] of parEntreprise) {
    if (lignes.length < 2) continue;

    const socle = lignes[0]!;
    const built = await buildConventionInput(sb as never, socle.id, null);
    if (!built) continue;

    const montant = lignes.reduce((n, l) => n + (l.total_amount_cents ?? 0), 0);

    conventions.push({
      companyId,
      companyName: un(socle.company)?.name ?? 'Entreprise',
      dossierIds: lignes.map((l) => l.id),
      anchorDossierId: socle.id,
      organizationId: built.organizationId,
      input: {
        ...built.input,
        // Le montant et la durée sont ceux de l'ensemble : la convention engage
        // l'entreprise pour tous ses salariés, pas pour le seul dossier socle.
        dossier: {
          ...built.input.dossier,
          totalAmountCents: montant,
          totalHours: lignes.reduce((n, l) => n + Number(l.total_hours ?? 0), 0),
        },
        participants: lignes
          .map((l) => {
            const a = un(l.learner);
            return a
              ? {
                  firstName: a.first_name,
                  lastName: a.last_name,
                  email: a.email ?? '',
                  birthDate: a.birth_date,
                }
              : null;
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr')),
      },
    });
  }

  return conventions;
}
