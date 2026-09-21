import type {
  ProspectForConversion, LearnerCandidate, CompanyCandidate, MatchResult, DuplicateSignal,
} from './types';

const norm = (s: string | null): string => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Un apprenant est réutilisé quand l'adresse ET le nom concordent.
 *
 * L'adresse seule ne suffit pas : une boîte partagée — le secrétariat d'une
 * entreprise, une adresse de couple, celle d'un parent — sert à plusieurs
 * personnes. En ne regardant que l'e-mail, la conversion rattachait la demande
 * de Nath Laurel à l'apprenante déjà enregistrée sur la même boîte, et le
 * dossier s'ouvrait au nom de quelqu'un d'autre (constaté le 21/09/2026).
 *
 * Quand l'un des deux noms manque, on s'en tient à l'adresse : mieux vaut
 * regrouper une fiche incomplète que créer un doublon silencieux.
 */
export function matchLearner(
  email: string,
  learners: readonly LearnerCandidate[],
  lastName?: string | null,
): MatchResult {
  const target = norm(email);
  if (!target) return { action: 'create' };

  const memeAdresse = learners.filter((l) => norm(l.email) === target);
  if (memeAdresse.length === 0) return { action: 'create' };

  const nomVise = norm(lastName ?? null);
  if (!nomVise) return { action: 'reuse', id: memeAdresse[0]!.id };

  const memeNom = memeAdresse.find((l) => {
    const n = norm(l.lastName);
    return n === '' || n === nomVise;
  });
  return memeNom ? { action: 'reuse', id: memeNom.id } : { action: 'create' };
}

export function matchCompany(
  siret: string | null,
  name: string | null,
  companies: readonly CompanyCandidate[],
): MatchResult {
  const cleanSiret = (siret ?? '').replace(/\s+/g, '');
  if (cleanSiret) {
    const bySiret = companies.find((c) => (c.siret ?? '').replace(/\s+/g, '') === cleanSiret);
    if (bySiret) return { action: 'reuse', id: bySiret.id };
  }
  const target = norm(name);
  if (target) {
    const byName = companies.find((c) => norm(c.name) === target);
    if (byName) return { action: 'reuse', id: byName.id };
  }
  return { action: 'create' };
}

export function detectPotentialDuplicates(
  prospect: ProspectForConversion,
  learners: readonly LearnerCandidate[],
  companies: readonly CompanyCandidate[],
): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  const emailNorm = norm(prospect.email);
  const lastNorm = norm(prospect.lastName);
  for (const l of learners) {
    if (norm(l.lastName) === lastNorm && norm(l.email) !== emailNorm) {
      signals.push({
        kind: 'learner', existingId: l.id,
        reason: 'Même nom, email différent',
        label: `${prospect.lastName} — ${l.email}`,
      });
    }
  }
  const companyNorm = norm(prospect.companyName);
  if (companyNorm) {
    for (const c of companies) {
      if (norm(c.name) === companyNorm) {
        signals.push({
          kind: 'company', existingId: c.id,
          reason: 'Entreprise au nom identique',
          label: c.name,
        });
      }
    }
  }
  return signals;
}
