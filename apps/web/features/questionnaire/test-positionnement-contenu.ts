// Le test de positionnement d'une formation, passé au premier cours du groupe.
// Ses questions partent du contenu pédagogique, du programme détaillé et des
// modalités de la formation (17/10/2026), plutôt que de ses seuls objectifs :
// deux questions par module du programme. Pur.

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
2. une mise en situation tirée du contenu réel du module (outil, exercice, cas qui sera travaillé), accessible à un débutant : type "choice", 3 ou 4 options concrètes dont une seule juste, plus la dernière option « Je ne sais pas » ; indique la bonne option, recopiée mot pour mot, dans "correcte".

${regleNombre}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{"questions": [{"id": "m1_auto", "type": "rating", "label": "...", "required": true, "options": [], "max": 5}, {"id": "m1_situation", "type": "choice", "label": "...", "required": true, "options": ["...", "...", "Je ne sais pas"], "max": 5, "correcte": "..."}]}

Français simple, sans jargon ; libellés de 200 caractères au plus.`;
}

export type TestGenere = { questions: QuestionDraft[]; corrections: Record<string, string> };
export type LectureTest = { ok: true; test: TestGenere } | { ok: false; raison: string };

/** Comparaison tolérante : casse, espaces, apostrophes et guillemets typographiques. */
const normaliser = (t: string) =>
  t
    .normalize('NFKC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const idPropre = (id: unknown, i: number) =>
  (typeof id === 'string' ? id : '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || `q${i + 1}`;

/**
 * La réponse de l'IA, lue avec tolérance (17/10/2026 : une réponse correcte
 * était rejetée pour une apostrophe ou une question de trop). Le nombre de
 * questions doit rester proche de l'attendu ; une mise en situation dont la
 * bonne réponse est introuvable reste posée, sans compter dans le score.
 */
export function lireTestGenere(texte: string, attendu: { min: number; max: number }): TestGenere | null {
  const r = lireTestGenereDetail(texte, attendu);
  return r.ok ? r.test : null;
}

export function lireTestGenereDetail(texte: string, attendu: { min: number; max: number }): LectureTest {
  const json = /\{[\s\S]*\}/.exec(texte);
  if (!json) return { ok: false, raison: 'pas de JSON dans la réponse' };
  let brut: unknown;
  try {
    brut = JSON.parse(json[0]);
  } catch {
    return { ok: false, raison: 'JSON illisible' };
  }
  const liste = Array.isArray((brut as { questions?: unknown }).questions) ? ((brut as { questions: unknown[] }).questions as Array<Record<string, unknown>>) : null;
  if (!liste) return { ok: false, raison: 'pas de liste « questions »' };

  const vus = new Set<string>();
  const questions: QuestionDraft[] = [];
  const corrections: Record<string, string> = {};
  liste.forEach((q, i) => {
    let id = idPropre(q.id, i);
    while (vus.has(id)) id = `${id}_${i}`;
    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => o.trim().slice(0, 300)) : [];
    const type = q.type === 'choice' && options.length >= 2 ? 'choice' : q.type === 'rating' ? 'rating' : q.type === 'choice' ? null : 'text';
    const label = typeof q.label === 'string' ? q.label.trim().slice(0, 500) : '';
    if (!type || !label) return;
    const p = questionDraftSchema.safeParse({ id, type, label, required: true, options: type === 'choice' ? options.slice(0, 20) : [], max: 5 });
    if (!p.success) return;
    vus.add(id);
    questions.push(p.data);
    if (type === 'choice' && typeof q.correcte === 'string') {
      const juste = p.data.options.find((o) => normaliser(o) === normaliser(q.correcte as string));
      if (juste && !/^je ne sais pas$/i.test(juste)) corrections[id] = juste;
    }
  });

  // Une marge de deux questions de part et d'autre : l'IA en ajoute ou en
  // oublie parfois une, ce n'est pas une raison pour tout jeter.
  const min = Math.max(2, attendu.min - 2);
  const max = Math.min(40, attendu.max + 2);
  if (questions.length < min || questions.length > max) {
    return { ok: false, raison: `${questions.length} questions valables pour ${attendu.min}–${attendu.max} attendues` };
  }
  return { ok: true, test: { questions, corrections } };
}

/** Le score au test : bonnes réponses aux mises en situation, et niveau déclaré moyen. Pur. */
export type ScoreTest = { readonly libelle: string; readonly pourcentage: number; readonly justes: number; readonly total: number };

export function scoreTest(
  schema: { questions?: ReadonlyArray<{ id: string; type: string; max?: number }>; corrections?: Record<string, string> } | null | undefined,
  reponses: Record<string, unknown> | null | undefined,
): ScoreTest | null {
  if (!schema?.questions || !reponses) return null;
  const corrections = schema.corrections ?? {};
  const situations = schema.questions.filter((q) => q.type === 'choice' && corrections[q.id]);
  const justes = situations.filter((q) => String(reponses[q.id] ?? '') === corrections[q.id]).length;
  const notes = schema.questions
    .filter((q) => q.type === 'rating')
    .map((q) => ({ v: Number(reponses[q.id]), max: q.max ?? 5 }))
    .filter((x) => Number.isFinite(x.v) && x.v >= 1 && x.v <= x.max);
  const declare = notes.length ? notes.reduce((t, x) => t + (x.v / x.max) * 5, 0) / notes.length : null;
  if (situations.length === 0 && declare === null) return null;
  const pourcentage = situations.length ? Math.round((justes / situations.length) * 100) : Math.round(((declare ?? 0) / 5) * 100);
  const parts = [
    situations.length ? `${justes}/${situations.length} justes` : null,
    declare !== null ? `${declare.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5 déclaré` : null,
  ].filter(Boolean);
  return { libelle: parts.join(' · '), pourcentage, justes, total: situations.length };
}
