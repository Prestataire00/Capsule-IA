import 'server-only';
import type { supabaseServer } from '@/shared/lib/supabase/server';

/**
 * Données réelles des deux graphiques de l'accueil.
 *
 * Elles étaient jusqu'ici codées en dur — un camembert « OPCO 42 % / FAF 28 % »
 * et une courbe d'activité datée de mai — affichées quel que soit l'organisme
 * (audit CAP-27). Sur un tableau de bord, un chiffre inventé est pire qu'une
 * case vide : il se lit comme une mesure.
 *
 * Même parti pris de résilience que `getOrgKpis` : une source en erreur est
 * journalisée et dégrade vers une série vide, jamais vers un 500.
 */
export type Tranche = { label: string; value: number; color: string };
export type HomeCharts = {
  readonly funders: Tranche[];
  readonly activityPoints: number[];
  readonly activityLabels: string[];
};

/** Palette de la charte, dans l'ordre d'attribution. */
const COULEURS = ['#7c3aed', '#10b981', '#f59e0b', '#fb923c', '#3b82f6', '#a1a1aa'];

const JOUR = 24 * 60 * 60 * 1000;

export async function getHomeCharts(sb: ReturnType<typeof supabaseServer>): Promise<HomeCharts> {
  const depuis = new Date(Date.now() - 6 * JOUR);
  depuis.setHours(0, 0, 0, 0);

  const [fundersRes, activiteRes] = await Promise.all([
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder:funders(name)')
      .limit(2000),
    sb
      .schema('app')
      .from('dossiers')
      .select('created_at')
      .gte('created_at', depuis.toISOString())
      .limit(2000),
  ]);

  // ── Répartition par financeur ────────────────────────────────────────────
  let funders: Tranche[] = [];
  if (fundersRes.error) {
    console.error(`[home-charts] dossier_funders indisponible — série vide: ${fundersRes.error.message}`);
  } else {
    const parNom = new Map<string, number>();
    for (const ligne of (fundersRes.data ?? []) as unknown as {
      funder: { name: string } | { name: string }[] | null;
    }[]) {
      const f = Array.isArray(ligne.funder) ? ligne.funder[0] : ligne.funder;
      const nom = f?.name?.trim();
      if (!nom) continue;
      parNom.set(nom, (parNom.get(nom) ?? 0) + 1);
    }
    funders = [...parNom.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({ label, value, color: COULEURS[i % COULEURS.length]! }));
  }

  // ── Activité des 7 derniers jours ────────────────────────────────────────
  const labels: string[] = [];
  const points: number[] = [];
  const parJour = new Map<string, number>();
  if (activiteRes.error) {
    console.error(`[home-charts] dossiers indisponible — série vide: ${activiteRes.error.message}`);
  } else {
    for (const d of (activiteRes.data ?? []) as unknown as { created_at: string }[]) {
      const jour = d.created_at.slice(0, 10);
      parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
    }
  }
  for (let i = 6; i >= 0; i--) {
    const j = new Date(Date.now() - i * JOUR);
    const cle = j.toISOString().slice(0, 10);
    labels.push(`${String(j.getDate()).padStart(2, '0')}/${String(j.getMonth() + 1).padStart(2, '0')}`);
    points.push(parJour.get(cle) ?? 0);
  }

  return { funders, activityPoints: points, activityLabels: labels };
}
