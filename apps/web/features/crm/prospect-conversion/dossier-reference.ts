// Référence dossier déterministe par prospect → idempotence à la re-conversion
// (l'unicité réelle est garantie par le check converted_dossier_id en amont).
export function generateDossierReference(prospectId: string, year: number): string {
  const short = prospectId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `DOS-${year}-${short}`;
}
