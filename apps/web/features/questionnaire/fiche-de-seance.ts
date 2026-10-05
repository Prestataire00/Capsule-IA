/**
 * La fiche besoin adaptée d'une séance sans formation : elle n'a pas de
 * formation à laquelle se rattacher, son code la désigne.
 */
export const codeFicheDeSeance = (sessionId: string): string => `fiche_besoin_seance_${sessionId}`;

export const estFicheDeSeance = (code: string | null | undefined): boolean => Boolean(code?.startsWith('fiche_besoin_seance_'));
