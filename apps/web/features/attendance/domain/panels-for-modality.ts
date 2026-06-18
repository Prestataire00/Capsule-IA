// Fonction pure : zéro import next/supabase/react/zod (domain layer).

export type ModalityPanels = { signature: boolean; zoom: boolean };

/**
 * Quels modes de preuve afficher pour une feuille selon la modalité de séance.
 * - présentiel / afest : signature manuscrite (lien/QR)
 * - distanciel : preuve de connexion (import Zoom)
 * - hybride : les deux
 * - inconnu : repli sûr = signature
 */
export const panelsForModality = (modality: string): ModalityPanels => {
  switch (modality) {
    case 'distanciel':
      return { signature: false, zoom: true };
    case 'hybride':
      return { signature: true, zoom: true };
    case 'presentiel':
    case 'afest':
    default:
      return { signature: true, zoom: false };
  }
};
