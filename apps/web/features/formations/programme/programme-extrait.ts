// ARCHETYPE: shared
// Le programme lu par l'IA dans le PDF joint à une demande : montré tel quel
// dans « Nouvelle demande », gardé avec le programme déposé, puis repris sur
// la fiche de la formation sur mesure créée à la conversion.
import { z } from 'zod';

const texte = (max: number) => z.string().max(max).default('');
const liste = z.array(z.string().max(2000)).max(60).default([]);

export const programmeExtraitSchema = z.object({
  title: texte(200),
  subtitle: texte(300),
  objectives: liste,
  programContent: texte(50000),
  targetAudience: texte(5000),
  prerequisites: liste,
  pedagogicalMethod: texte(10000),
  teachingTeam: texte(10000),
  deroulement: texte(10000),
  evaluationMethod: texte(10000),
  resultIndicators: texte(10000),
  accessibilityInfo: texte(10000),
  durationHours: texte(10),
});

export type ProgrammeExtrait = z.infer<typeof programmeExtraitSchema>;

/** Champs HTML : à nettoyer avant tout affichage ou enregistrement. */
export const CHAMPS_HTML = [
  'programContent',
  'pedagogicalMethod',
  'teachingTeam',
  'evaluationMethod',
  'resultIndicators',
  'accessibilityInfo',
] as const satisfies readonly (keyof ProgrammeExtrait)[];
