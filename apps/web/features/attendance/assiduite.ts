// Fonction pure : zéro import de next/supabase/react/zod (domain layer).
export type SessionDuration = {
  durationHours: number;
  signed: boolean;
};

export type Assiduite = {
  heuresSignees: number;
  heuresPlanifiees: number;
  taux: number; // 0..1
};

export function computeAssiduite(sessions: SessionDuration[]): Assiduite {
  let heuresSignees = 0;
  let heuresPlanifiees = 0;
  for (const s of sessions) {
    if (s.durationHours <= 0) continue;
    heuresPlanifiees += s.durationHours;
    if (s.signed) heuresSignees += s.durationHours;
  }
  const taux = heuresPlanifiees > 0 ? heuresSignees / heuresPlanifiees : 0;
  return { heuresSignees, heuresPlanifiees, taux };
}
