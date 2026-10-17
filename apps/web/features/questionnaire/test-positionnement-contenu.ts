// Le test de positionnement d'une formation, passé au premier cours du groupe.
// Ses questions partent du contenu pédagogique, du programme détaillé et des
// modalités de la formation (17/10/2026), plutôt que de ses seuls objectifs :
// deux questions par module du programme. Pur.

import { z } from 'zod';
import { questionDraftSchema, type QuestionDraft } from './template.schema';
import type { Programme } from '@/features/formations/programme/types';

/** Ce que l'IA sait de la formation pour écrire le test. */
export type ContenuFormation = {
  titre: string;
  resume: string | null;
  modalite: string | null;
  dureeHeures: number | null;
  methodePedagogique: string | null;
  methodeEvaluation: string | null;
  objectifs: readonly string[];
  /** Les modules du programme détaillé, avec leur contenu. */
  modules: ReadonlyArray<{ titre: string; contenu: readonly string[] }>;
  /** Le reste du programme, en texte (sections libres, listes, déroulé). */
  programmeTexte: string;
};

const sansBalises = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Le programme détaillé, à plat : modules d'un côté, le reste en texte. */
export function lireProgramme(programme: Programme | null): { modules: ContenuFormation['modules']; texte: string } {
  if (!programme) return { modules: [], texte: '' };
  const modules: Array<{ titre: string; contenu: string[] }> = [];
  const texte: string[] = [];
  for (const sec of programme.sections) {
    if (sec.type === 'modules') {
      for (const m of sec.modules) {
        modules.push({
          titre: [m.code, m.title].filter(Boolean).join(' — '),
          contenu: m.submodules.flatMap((sm) => [sm.title, ...sm.contenu, ...sm.objectifs.map((o) => `Objectif : ${o}`)]).filter(Boolean),
        });
      }
    } else if (sec.type === 'richtext') texte.push(`${sec.title} : ${sansBalises(sec.html)}`);
    else if (sec.type === 'bullets') texte.push(`${sec.title} : ${sec.items.join(' ; ')}`);
    else if (sec.type === 'keyvalue') texte.push(`${sec.title} : ${sec.rows.map((r) => `${r.label} ${r.value}`).join(' ; ')}`);
    else if (sec.type === 'schedule') texte.push(`${sec.title} : ${sec.rows.map((r) => `${r.time} ${r.label}`).join(' ; ')}`);
  }
  return { modules: modules.filter((m) => m.titre || m.contenu.length), texte: texte.join('\n').slice(0, 8000) };
}

/** Combien de questions attendre : deux par module, sinon entre 10 et 16. */
export const nombreAttendu = (c: Pick<ContenuFormation, 'modules'>): { min: number; max: number } =>
  c.modules.length > 0 ? { min: c.modules.length * 2, max: c.modules.length * 2 } : { min: 10, max: 16 };

export const PREFIXE_TEST_POSITIONNEMENT = 'test_positionnement_';

/** Un test par formation : son code dérive de l'identifiant de la formation. */
export const codeTestPositionnement = (formationId: string) => `${PREFIXE_TEST_POSITIONNEMENT}${formationId.replace(/-/g, '')}`;

export const titreTestPositionnement = (formation: string) => `Test de positionnement — ${formation}`.slice(0, 200);

export function promptTestPositionnement(c: ContenuFormation): string {
  const modules = c.modules.length
    ? c.modules.map((m, i) => `${i + 1}. ${m.titre}${m.contenu.length ? `\n   ${m.contenu.slice(0, 15).join('\n   ')}` : ''}`).join('\n')
    : '(pas de modules détaillés)';
  const regleNombre = c.modules.length
    ? `Exactement DEUX questions par module, dans l'ordre des modules (${c.modules.length * 2} questions), ids "m<n>_auto" et "m<n>_situation".`
    : 'Entre 10 et 16 questions couvrant tout le programme, par paires (une auto-évaluation, une mise en situation), ids "q<n>_auto" et "q<n>_situation".';
  return `Tu es formateur et expert Qualiopi dans un organisme de formation français.
Construis le TEST DE POSITIONNEMENT passé par chaque stagiaire au PREMIER COURS de la formation « ${c.titre} », sur son téléphone, en 5 à 10 minutes, avant d'avoir rien appris. Il mesure son niveau de départ sur ce que la formation va enseigner, pour que le formateur adapte son cours.

Appuie-toi sur le contenu pédagogique, le programme et les modalités ci-dessous — pas seulement sur les objectifs.

Présentation : ${c.resume ?? '—'}
Modalité : ${c.modalite ?? '—'}${c.dureeHeures ? ` · ${c.dureeHeures} h` : ''}
Méthodes pédagogiques : ${c.methodePedagogique ?? '—'}
Modalités d'évaluation : ${c.methodeEvaluation ?? '—'}
Objectifs (pour mémoire) : ${c.objectifs.length ? c.objectifs.join(' ; ') : '—'}

Modules du programme :
${modules}

Autres éléments du programme :
${c.programmeTexte || '—'}

Pour chaque module (ou thème) :
1. une auto-évaluation : type "rating", max 5, « Je sais … » reformulant un savoir-faire précis du module, à la première personne (1 = pas du tout, 5 = parfaitement) ;
2. une mise en situation tirée du contenu réel du module (outil, exercice, cas qui sera travaillé), accessible à un débutant : type "choice", 3 ou 4 options concrètes dont une seule juste, plus la dernière option « Je ne sais pas ».

${regleNombre}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{"questions": [{"id": "m1_auto", "type": "rating", "label": "...", "required": true, "options": [], "max": 5}, {"id": "m1_situation", "type": "choice", "label": "...", "required": true, "options": ["...", "...", "Je ne sais pas"], "max": 5}]}

Français simple, sans jargon ; libellés de 200 caractères au plus.`;
}

const reponseSchema = z.object({ questions: z.array(questionDraftSchema).min(2).max(40) });

/** La réponse de l'IA, si elle respecte le nombre de questions attendu. */
export function lireTestGenere(texte: string, attendu: { min: number; max: number }): QuestionDraft[] | null {
  const json = /\{[\s\S]*\}/.exec(texte);
  if (!json) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(json[0]);
  } catch {
    return null;
  }
  const p = reponseSchema.safeParse(brut);
  if (!p.success) return null;
  const questions = p.data.questions;
  if (questions.length < attendu.min || questions.length > attendu.max) return null;
  if (new Set(questions.map((q) => q.id)).size !== questions.length) return null;
  if (questions.some((q) => q.type === 'choice' && q.options.length < 2)) return null;
  return questions;
}
