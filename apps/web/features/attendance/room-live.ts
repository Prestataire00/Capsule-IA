/**
 * Constantes et forme des données de l'écran en direct, partagées entre l'API
 * et l'écran de projection (navigateur) : aucune dépendance serveur ici.
 */

export const ROTATION_MS = 10_000;

export type LiveParticipant = {
  readonly key: string;
  readonly name: string;
  readonly kind: 'learner' | 'trainer';
  readonly state: string;
  readonly entryAt: string | null;
  readonly exitAt: string | null;
};

export type LivePayload = {
  readonly qr: string | null;
  readonly rotatesAt: number;
  readonly finalized: boolean;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly expected: number;
  readonly entered: number;
  readonly exited: number;
  readonly participants: LiveParticipant[];
};
