import 'server-only';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '../infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '../infrastructure/supabase-trainer-competency.repository';
import { GetCompetencyAlertsQuery } from '../application/queries/get-competency-alerts';
import { loadSessionsByIds, mySessionIds } from '@/features/trainer-space/my-sessions';
import { unreadCounts } from '@/features/trainer-space/session-messages';
import { dayKey, heure, jourRelatif } from '@/features/trainer-space/dates';
import { FormateurRail, type RailCounts, type SeanceRecente } from './formateur-rail';

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Charge ce que la barre latérale affiche : les pastilles et les prochaines
 * séances. Un échec de lecture ne doit pas emporter la navigation — le
 * formateur doit pouvoir circuler même si un compteur est indisponible.
 */
export async function FormateurRailServer({ nom }: { nom?: string }) {
  let counts: RailCounts = {};
  let seances: SeanceRecente[] = [];

  try {
    const sb = supabaseServer();
    const focus = cookies().get('of_focus')?.value ?? 'all';
    const [memberships, ids, { data: auth }] = await Promise.all([
      new SupabaseMembershipReader(sb as never).list(),
      mySessionIds(sb),
      sb.auth.getUser(),
    ]);

    const maintenant = Date.now();
    const toutes = (
      await loadSessionsByIds(
        sb,
        ids,
        { from: new Date(maintenant - JOUR_MS), to: new Date(maintenant + 60 * JOUR_MS) },
        focus === 'all' ? null : focus,
      )
    ).filter((s) => s.status !== 'cancelled');

    const aujourdhui = dayKey(new Date(maintenant));
    const duJour = toutes.filter(
      (s) =>
        dayKey(s.startsAt) === aujourdhui ||
        (Date.parse(s.startsAt) <= maintenant && Date.parse(s.endsAt) >= maintenant),
    );

    const nonLus = auth.user
      ? await unreadCounts(toutes.map((s) => s.id), auth.user.id, 'formateur')
      : new Map<string, number>();

    const visible = focus === 'all' ? memberships : memberships.filter((m) => m.organizationId === focus);
    const alertsQuery = new GetCompetencyAlertsQuery(new SupabaseTrainerCompetencyRepository(sb));
    const alerts = await Promise.all(visible.map((m) => alertsQuery.execute(m.trainerId)));

    counts = {
      duJour: duJour.length,
      messages: [...nonLus.values()].reduce((n, v) => n + v, 0),
      competences: alerts.reduce((s, a) => s + a.expired + a.expiringSoon, 0),
    };

    seances = toutes
      .filter((s) => Date.parse(s.endsAt) >= maintenant)
      .slice(0, 5)
      .map((s) => ({ id: s.id, titre: s.title, quand: `${jourRelatif(s.startsAt)} · ${heure(s.startsAt)}` }));
  } catch (e) {
    console.error('[espace formateur] barre latérale sans ses compteurs', (e as Error).message);
  }

  return <FormateurRail counts={counts} seances={seances} nom={nom} />;
}
