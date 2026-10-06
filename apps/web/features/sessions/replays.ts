/**
 * Les replays d'une séance (0079, 0215) : le lien d'un enregistrement tl;dv,
 * Lexi, Meet ou Zoom, collé sur la séance. Module pur : reconnaître la source
 * et valider le lien.
 */

export type SourceReplay = 'tldv' | 'lexi' | 'meet' | 'zoom' | 'manual';

export const LIBELLE_SOURCE: Record<SourceReplay, string> = {
  tldv: 'tl;dv',
  lexi: 'Lexi',
  meet: 'Google Meet',
  zoom: 'Zoom',
  manual: 'Lien',
};

/** Un lien web valide, ou null : seul http(s) s'ouvre sans risque chez le client. */
export function lienDeReplay(brut: string): URL | null {
  try {
    const u = new URL(brut.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

export function sourceDuReplay(u: URL): SourceReplay {
  const h = u.hostname.toLowerCase();
  if (h.endsWith('tldv.io')) return 'tldv';
  if (h.includes('lexi')) return 'lexi';
  if (h.endsWith('zoom.us')) return 'zoom';
  if (h.endsWith('meet.google.com') || h.endsWith('drive.google.com')) return 'meet';
  return 'manual';
}
