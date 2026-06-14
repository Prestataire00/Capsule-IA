import type {
  ProspectForConversion, LearnerCandidate, CompanyCandidate, MatchResult, DuplicateSignal,
} from './types';

const norm = (s: string | null): string => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function matchLearner(email: string, learners: readonly LearnerCandidate[]): MatchResult {
  const target = norm(email);
  const hit = learners.find((l) => norm(l.email) === target);
  return hit ? { action: 'reuse', id: hit.id } : { action: 'create' };
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
