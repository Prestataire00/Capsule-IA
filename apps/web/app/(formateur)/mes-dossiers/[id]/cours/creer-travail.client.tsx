'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Check, X, Sparkles, ListChecks, PenLine, Layers, Video, FileText } from 'lucide-react';
import { problemesDuQuiz, type QuestionQuiz } from '@/features/pedagogie/quiz';
import { FORMES, FORME_LABELS, FORME_DESCRIPTIONS, problemesDuContenu, type Forme } from '@/features/pedagogie/kinds';
import { parseTexteATrou } from '@/features/pedagogie/cloze';
import { creerTravailFormateur, genererAvecIA } from './actions';

/**
 * Création d'un exercice, sous l'une des cinq formes.
 *
 * L'IA propose un brouillon à partir de la formation elle-même ; il remplit le
 * formulaire, il ne s'enregistre pas. Le formateur relit, corrige, publie — et
 * la direction valide. Trois regards avant le stagiaire, dont deux humains.
 */

/**
 * `points` admet la chaîne vide : le champ doit pouvoir être vidé le temps d'y
 * retaper un nombre. Le forcer à `0` dès la première touche effacée donnait une
 * question qui ne comptait plus rien, sans que rien ne le dise.
 */
type Brouillon = { id: string; enonce: string; choix: string[]; bonnes: number[]; points: number | '' };
type Carte = { recto: string; verso: string };

const CHAMP =
  'w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400';
const ZONE =
  'w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400';

const ICONES: Record<Forme, typeof ListChecks> = {
  quiz: ListChecks,
  texte_a_trou: FileText,
  cartes_memoire: Layers,
  video: Video,
  devoir: PenLine,
};

const nouvelleQuestion = (): Brouillon => ({
  id: crypto.randomUUID(),
  enonce: '',
  choix: ['', ''],
  bonnes: [],
  points: 1,
});

export function CreerTravail({ dossierId, seances }: { dossierId: string; seances: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [kind, setKind] = useState<Forme>('quiz');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [passScore, setPassScore] = useState('');
  const [questions, setQuestions] = useState<Brouillon[]>([nouvelleQuestion()]);
  const [texte, setTexte] = useState('');
  const [cartes, setCartes] = useState<Carte[]>([{ recto: '', verso: '' }]);
  const [urlVideo, setUrlVideo] = useState('');
  const [consigneIA, setConsigneIA] = useState('');
  const [aiAssisted, setAiAssisted] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [genere, setGenere] = useState(false);

  const utiliseQuestions = kind === 'quiz' || kind === 'video';

  const majQuestion = (i: number, patch: Partial<Brouillon>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const basculerBonne = (i: number, index: number) =>
    setQuestions((qs) =>
      qs.map((q, j) =>
        j === i
          ? { ...q, bonnes: q.bonnes.includes(index) ? q.bonnes.filter((b) => b !== index) : [...q.bonnes, index] }
          : q,
      ),
    );

  const pourValidation: QuestionQuiz[] = questions.map((q) => ({
    ...q,
    choix: q.choix,
    bonnes: q.bonnes,
    points: q.points === '' ? 1 : q.points,
  }));
  const trous = kind === 'texte_a_trou' ? parseTexteATrou(texte).reponses : [];
  const contenu = {
    texte: kind === 'texte_a_trou' ? texte : undefined,
    cartes: kind === 'cartes_memoire' ? cartes : undefined,
    url: kind === 'video' ? urlVideo.trim() : undefined,
  };
  const problemes = [
    ...(utiliseQuestions ? problemesDuQuiz(pourValidation).map((p) => ({ ...p })) : []),
    ...problemesDuContenu(kind, contenu, trous.length).map((p) => ({ question: null, motif: p.motif })),
  ];

  const reinitialiser = () => {
    setTitle('');
    setInstructions('');
    setSessionId('');
    setDueAt('');
    setPassScore('');
    setQuestions([nouvelleQuestion()]);
    setTexte('');
    setCartes([{ recto: '', verso: '' }]);
    setUrlVideo('');
    setConsigneIA('');
    setAiAssisted(false);
    setGenere(false);
  };

  const proposer = () => {
    setErreur(null);
    startTransition(async () => {
      const res = await genererAvecIA({ dossierId, kind, sessionId: sessionId || undefined, consigne: consigneIA || undefined });
      if (!res.ok) return setErreur(res.error);

      const b = res.brouillon;
      if (!title.trim()) setTitle(b.title);
      if (!instructions.trim() && b.instructions) setInstructions(b.instructions);
      if (b.questions.length > 0) {
        setQuestions(
          b.questions.map((q) => ({
            id: crypto.randomUUID(),
            enonce: q.enonce,
            choix: q.choix,
            bonnes: q.bonnes,
            points: q.points,
          })),
        );
      }
      if (b.texte) setTexte(b.texte);
      if (b.cartes.length > 0) setCartes(b.cartes.map((c) => ({ recto: c.recto, verso: c.verso })));
      setAiAssisted(true);
      setGenere(true);
    });
  };

  const enregistrer = (publier: boolean) => {
    setErreur(null);
    if (!title.trim()) return setErreur('Donnez un titre.');
    startTransition(async () => {
      const res = await creerTravailFormateur({
        dossierId,
        kind,
        aiAssisted,
        contenu: {
          texte: kind === 'texte_a_trou' ? texte : undefined,
          cartes: kind === 'cartes_memoire' ? cartes.filter((c) => c.recto.trim() || c.verso.trim()) : undefined,
          url: kind === 'video' ? urlVideo.trim() : undefined,
        },
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        sessionId: sessionId || undefined,
        dueAt: dueAt || undefined,
        passScore: kind === 'quiz' && passScore.trim() ? Number(passScore) : null,
        questions: utiliseQuestions ? pourValidation.map((q) => ({ ...q, choix: [...q.choix], bonnes: [...q.bonnes] })) : undefined,
        publier,
      });
      if (!res.ok) return setErreur(res.error);
      reinitialiser();
      setOuvert(false);
      router.refresh();
    });
  };

  if (!ouvert) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {FORMES.map((f) => {
          const Icone = ICONES[f];
          return (
            <button
              key={f}
              type="button"
              onClick={() => {
                setKind(f);
                setOuvert(true);
              }}
              className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-3 text-left hover:border-orange-300 dark:hover:border-orange-900/60 hover:shadow-sm transition"
            >
              <span className="w-8 h-8 rounded-lg grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 mb-2">
                <Icone className="w-4 h-4" />
              </span>
              <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{FORME_LABELS[f]}</span>
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5">
                {FORME_DESCRIPTIONS[f]}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/25 dark:to-zinc-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{FORME_LABELS[kind]}</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{FORME_DESCRIPTIONS[kind]}</p>
        </div>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="w-8 h-8 rounded-lg grid place-items-center text-zinc-500 hover:bg-white dark:hover:bg-zinc-800 transition"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Assistance IA ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50/60 dark:bg-purple-950/20 p-3 space-y-2">
        <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          Faire proposer un brouillon
        </p>
        <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
          À partir de votre formation : objectifs, programme, durée, modalité et nombre de participants. Vous relisez et
          corrigez avant d&apos;enregistrer — rien n&apos;est publié sans vous.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={consigneIA}
            onChange={(e) => setConsigneIA(e.target.value)}
            placeholder="Précision facultative (ex. centrer sur la sécurité des données)"
            maxLength={1000}
            className={CHAMP}
          />
          <button
            type="button"
            onClick={proposer}
            disabled={pending}
            className="h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-60 shrink-0"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {genere ? 'Proposer à nouveau' : 'Proposer'}
          </button>
        </div>
        {genere && (
          <p className="text-[12px] text-purple-700 dark:text-purple-300">
            Brouillon rempli ci-dessous. Relisez chaque bonne réponse : c&apos;est là que l&apos;IA se trompe.
          </p>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre"
        maxLength={200}
        className={CHAMP}
      />

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder="Consigne pour les stagiaires (facultatif)"
        className={ZONE}
      />

      <div className="grid sm:grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Séance (facultatif)</span>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={CHAMP}>
            <option value="">Aucune</option>
            {seances.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">À rendre avant</span>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={CHAMP} />
        </label>
        {kind === 'quiz' && (
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Seuil de réussite (%)</span>
            <input
              value={passScore}
              onChange={(e) => setPassScore(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="Aucun"
              className={`${CHAMP} tabular-nums`}
            />
          </label>
        )}
      </div>

      {kind === 'video' && (
        <input
          value={urlVideo}
          onChange={(e) => setUrlVideo(e.target.value)}
          type="url"
          placeholder="Lien de la vidéo (https://…)"
          className={CHAMP}
        />
      )}

      {kind === 'texte_a_trou' && (
        <div className="space-y-1.5">
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={7}
            maxLength={8000}
            placeholder="Écrivez votre texte et entourez de crochets les mots à masquer : L'[intelligence] artificielle…"
            className={ZONE}
          />
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {trous.length} trou{trous.length > 1 ? 's' : ''}
            {trous.length > 0 && ` · ${trous.slice(0, 8).join(', ')}${trous.length > 8 ? '…' : ''}`}
          </p>
        </div>
      )}

      {kind === 'cartes_memoire' && (
        <div className="space-y-2">
          {cartes.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[12px] font-bold text-zinc-400 tabular-nums mt-2 w-5 shrink-0">{i + 1}</span>
              <input
                value={c.recto}
                onChange={(e) => setCartes((cs) => cs.map((x, j) => (j === i ? { ...x, recto: e.target.value } : x)))}
                placeholder="Recto — la question"
                maxLength={300}
                className={CHAMP}
              />
              <input
                value={c.verso}
                onChange={(e) => setCartes((cs) => cs.map((x, j) => (j === i ? { ...x, verso: e.target.value } : x)))}
                placeholder="Verso — la réponse"
                maxLength={500}
                className={CHAMP}
              />
              <button
                type="button"
                onClick={() => setCartes((cs) => (cs.length === 1 ? cs : cs.filter((_, j) => j !== i)))}
                aria-label={`Retirer la carte ${i + 1}`}
                className="w-9 h-9 rounded-md grid place-items-center text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCartes((cs) => [...cs, { recto: '', verso: '' }])}
            className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une carte
          </button>
        </div>
      )}

      {utiliseQuestions && (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/60 p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-bold text-zinc-400 tabular-nums mt-2 w-5 shrink-0">{i + 1}</span>
                <input
                  value={q.enonce}
                  onChange={(e) => majQuestion(i, { enonce: e.target.value })}
                  placeholder="Énoncé de la question"
                  maxLength={500}
                  className={CHAMP}
                />
                <input
                  value={q.points}
                  onChange={(e) => {
                    const chiffres = e.target.value.replace(/[^\d]/g, '');
                    // Un point au minimum : c'est déjà ce qu'exige `problemesDuQuiz`, autant le tenir ici.
                    majQuestion(i, { points: chiffres === '' ? '' : Math.max(1, Number(chiffres)) });
                  }}
                  onBlur={() => {
                    if (q.points === '') majQuestion(i, { points: 1 });
                  }}
                  inputMode="numeric"
                  aria-label={`Points de la question ${i + 1}`}
                  className={`${CHAMP} w-16 shrink-0 tabular-nums text-center`}
                />
                {/* Un nombre nu dans une case sans nom n'apprend rien à personne. */}
                <span className="text-[11px] font-semibold text-zinc-400 shrink-0 mt-2.5">pts</span>
                <button
                  type="button"
                  onClick={() => setQuestions((qs) => (qs.length === 1 ? qs : qs.filter((_, j) => j !== i)))}
                  aria-label={`Retirer la question ${i + 1}`}
                  className="w-9 h-9 rounded-md grid place-items-center text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="pl-7 space-y-1.5">
                {q.choix.map((c, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={q.bonnes.includes(index)}
                      onChange={() => basculerBonne(i, index)}
                      aria-label={`Bonne réponse : proposition ${index + 1}`}
                      className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <input
                      value={c}
                      onChange={(e) => majQuestion(i, { choix: q.choix.map((v, j) => (j === index ? e.target.value : v)) })}
                      placeholder={`Proposition ${index + 1}`}
                      maxLength={300}
                      className={CHAMP}
                    />
                    {q.choix.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          majQuestion(i, {
                            choix: q.choix.filter((_, j) => j !== index),
                            bonnes: q.bonnes.filter((b) => b !== index).map((b) => (b > index ? b - 1 : b)),
                          })
                        }
                        aria-label={`Retirer la proposition ${index + 1}`}
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-400 hover:text-red-600 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => majQuestion(i, { choix: [...q.choix, ''] })}
                  className="text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Ajouter une proposition
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, nouvelleQuestion()])}
            className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une question
          </button>
        </div>
      )}

      {problemes.length > 0 && (
        <ul className="space-y-0.5">
          {problemes.slice(0, 4).map((p, i) => (
            <li key={i} className="text-[12px] text-amber-700 dark:text-amber-400">
              {p.question ? `Question ${p.question} : ` : ''}
              {p.motif}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => enregistrer(true)}
          disabled={pending || problemes.length > 0}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Envoyer à la validation
        </button>
        <button
          type="button"
          onClick={() => enregistrer(false)}
          disabled={pending}
          className="h-9 px-3 rounded-lg text-[13px] font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition disabled:opacity-60"
        >
          Garder en brouillon
        </button>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Un contenu publié passe d&apos;abord par la validation de la direction.
        </span>
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </section>
  );
}
