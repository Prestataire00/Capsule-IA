import type { ParticipantState } from './completeness';

/**
 * À qui envoyer le lien d'émargement d'une feuille, et quand. Pur.
 *
 * Envoi manuel (bouton de l'équipe) : tout apprenant attendu qui n'a pas fini
 * de signer — y compris pour sa sortie. Envoi automatique : une seule fois par
 * feuille et par personne, à qui n'a encore rien signé (repris de SoSafe,
 * mais par feuille et non par session : ses envois multi-jours s'arrêtaient
 * après le premier).
 */

export type LinkCandidate = {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly state: ParticipantState;
};

export type LinkMode = 'manuel' | 'auto';

export function linkRecipients(
  candidates: readonly LinkCandidate[],
  mode: LinkMode,
  dejaEnvoyes: ReadonlySet<string>,
): { envoyer: LinkCandidate[]; ignores: number; sansEmail: string[] } {
  const envoyer: LinkCandidate[] = [];
  const sansEmail: string[] = [];
  let ignores = 0;
  for (const c of candidates) {
    const fini = c.state === 'complet' || c.state === 'absent' || c.state === 'excuse';
    if (fini || (mode === 'auto' && c.state !== 'a_signer')) {
      ignores++;
      continue;
    }
    const email = c.email?.trim().toLowerCase();
    if (!email) {
      sansEmail.push(c.name);
      continue;
    }
    if (mode === 'auto' && dejaEnvoyes.has(email)) {
      ignores++;
      continue;
    }
    envoyer.push(c);
  }
  return { envoyer, ignores, sansEmail };
}

/** L'envoi automatique part de 30 minutes avant le début à 10 minutes après. */
export function autoSendDue(windowStart: Date, now: Date): boolean {
  const t = now.getTime();
  const debut = windowStart.getTime();
  return t >= debut - 30 * 60_000 && t <= debut + 10 * 60_000;
}
