// ARCHETYPE: workflow
// Justification: espace apprenant token-based — accès docs, replays, supports, exos, réclamation.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  GraduationCap,
  Calendar,
  Clock,
  Video,
  FileText,
  Download,
  Play,
  CheckCircle2,
  CircleDashed,
  Sparkles,
  Award,
  BookOpen,
  PenLine,
  MessageSquareWarning,
  ChevronRight,
  ExternalLink,
  User,
  AlertTriangle,
  Send,
  Inbox,
  Hourglass,
  XCircle,
} from 'lucide-react';
import { learners, dossiers, formations, trainers, sessionsByDossier, modulesByDossier } from '@/shared/mock/data';
import { submitComplaint } from './actions';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseServer } from '@/shared/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Données réelles depuis RPC (si JWT valide), mappées au format mock pour
// laisser l'UI inchangée. Si JWT invalide → fallback mock Alice (legacy démo).
type RealDashboard = {
  learner: { id: string; first_name: string; last_name: string; email: string };
  organization: { id: string; name: string };
  dossier: {
    id: string; reference: string; status: string; modality: string;
    start_date: string; end_date: string; total_hours: number;
    formation: { id: string; title: string; summary: string | null; description: string | null; objectives: string[] };
  };
  sessions: Array<{ id: string; starts_at: string; ends_at: string; status: string; modality: string; location: string | null; remote_url: string | null; title: string | null }>;
  modules: Array<{ id: string; title: string; position: number; duration_hours: number; start_date: string | null }>;
  trainer: { first_name: string; last_name: string; email: string } | null;
};

type RealComplaint = {
  id: string;
  reference: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  severity: string;
  category: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  events: Array<{ kind: string; occurred_at: string; payload: Record<string, unknown> }>;
};

async function loadRealData(token: string): Promise<{ dashboard: RealDashboard; complaints: RealComplaint[] } | null> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return null;
  const sb = supabaseServer();
  const [dash, comp] = await Promise.all([
    sb.rpc('get_apprenant_dashboard' as never, { p_learner_id: verified.value.learnerId } as never),
    sb.rpc('get_learner_complaints' as never, { p_learner_id: verified.value.learnerId } as never),
  ]);
  if (dash.error || !dash.data) return null;
  const dashboard = dash.data as unknown as RealDashboard;
  if (!dashboard.learner || !dashboard.dossier) return null;
  const complaints = (comp.data ?? []) as unknown as RealComplaint[];
  return { dashboard, complaints };
}

// Mock fallback : tous les tokens non-JWT mappent à Alice (l-1) pour la VF
function resolveLearnerMock(token: string) {
  if (!token || token.length < 3) return null;
  return learners.find((l) => l.id === 'l-1') ?? null;
}

const modalityLabel: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

function formatSessionDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function formatSessionTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default async function EspaceApprenantPage({ params }: { params: { token: string } }) {
  const real = await loadRealData(params.token);

  // Mode dynamique (JWT valide + dossier en DB) — sinon fallback mock pour démo
  let learner: { id: string; firstName: string; lastName: string; email: string };
  let dossier: {
    id: string; reference: string; learnerId: string; formationId: string;
    startDate: string; endDate: string; totalHours: number;
    modality: string; trainerIds: string[];
  };
  let formation: { id: string; title: string } | undefined;
  let trainer: { id: string; firstName: string; lastName: string; email: string } | undefined;
  let sessions: Array<{ id: string; status: string; startsAt: string; endsAt: string; location?: string | null }>;
  let modules: Array<{ id: string; title: string; position: number; durationHours: number }>;

  if (real) {
    learner = {
      id: real.dashboard.learner.id,
      firstName: real.dashboard.learner.first_name,
      lastName: real.dashboard.learner.last_name,
      email: real.dashboard.learner.email,
    };
    dossier = {
      id: real.dashboard.dossier.id,
      reference: real.dashboard.dossier.reference,
      learnerId: learner.id,
      formationId: real.dashboard.dossier.formation.id,
      startDate: real.dashboard.dossier.start_date,
      endDate: real.dashboard.dossier.end_date,
      totalHours: real.dashboard.dossier.total_hours,
      modality: real.dashboard.dossier.modality,
      trainerIds: real.dashboard.trainer ? ['live-trainer'] : [],
    };
    formation = { id: real.dashboard.dossier.formation.id, title: real.dashboard.dossier.formation.title };
    trainer = real.dashboard.trainer
      ? { id: 'live-trainer', firstName: real.dashboard.trainer.first_name, lastName: real.dashboard.trainer.last_name, email: real.dashboard.trainer.email }
      : undefined;
    sessions = real.dashboard.sessions.map((s) => ({
      id: s.id,
      status: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'in_progress' : 'scheduled',
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location,
    }));
    modules = real.dashboard.modules.map((m) => ({
      id: m.id,
      title: m.title,
      position: m.position,
      durationHours: m.duration_hours,
    }));
  } else {
    const learnerMock = resolveLearnerMock(params.token);
    if (!learnerMock) return notFound();
    const dossierMock = dossiers.find((d) => d.learnerId === learnerMock.id);
    if (!dossierMock) return notFound();
    learner = { id: learnerMock.id, firstName: learnerMock.firstName, lastName: learnerMock.lastName, email: learnerMock.email };
    dossier = dossierMock;
    formation = formations.find((f) => f.id === dossierMock.formationId);
    trainer = trainers.find((t) => dossierMock.trainerIds.includes(t.id));
    sessions = sessionsByDossier[dossierMock.id] ?? [];
    modules = modulesByDossier[dossierMock.id] ?? [];
  }

  const sessionsDone = sessions.filter((s) => s.status === 'done').length;
  const progress = sessions.length ? Math.round((sessionsDone / sessions.length) * 100) : 0;

  // Mock documents administratifs
  const adminDocs = [
    { id: 'doc-1', title: 'Convention de formation signée', type: 'PDF', size: '152 Ko', status: 'signed' as const, date: '2026-08-25' },
    { id: 'doc-2', title: 'Programme détaillé', type: 'PDF', size: '320 Ko', status: 'available' as const, date: '2026-08-25' },
    { id: 'doc-3', title: 'Livret d\'accueil', type: 'PDF', size: '480 Ko', status: 'available' as const, date: '2026-08-25' },
    { id: 'doc-4', title: 'Règlement intérieur', type: 'PDF', size: '90 Ko', status: 'available' as const, date: '2026-08-25' },
    { id: 'doc-5', title: 'Attestation de présence', type: 'PDF', size: '—', status: 'pending' as const, date: 'à la fin' },
    { id: 'doc-6', title: 'Certificat de réalisation', type: 'PDF', size: '—', status: 'pending' as const, date: 'à la fin' },
  ];

  // Mock supports / exercices par module
  const supportsByModule: Record<string, { title: string; type: string; size: string }[]> = {
    'm-1-1': [
      { title: 'Slides — Comptabilité générale', type: 'PDF', size: '4.2 Mo' },
      { title: 'Cas pratique : écritures de base', type: 'PDF', size: '180 Ko' },
      { title: 'Tableur — Modèle de plan comptable', type: 'XLSX', size: '45 Ko' },
    ],
    'm-1-2': [
      { title: 'Slides — TVA', type: 'PDF', size: '3.8 Mo' },
      { title: 'Fiche mémo : taux et exceptions', type: 'PDF', size: '220 Ko' },
    ],
  };

  const exercises = [
    { id: 'ex-1', title: 'Exercice 1 — Écritures comptables', dueDate: '2026-09-08', status: 'submitted' as const, moduleTitle: 'Comptabilité générale' },
    { id: 'ex-2', title: 'Exercice 2 — Bilan simplifié', dueDate: '2026-09-22', status: 'submitted' as const, moduleTitle: 'Comptabilité générale' },
    { id: 'ex-3', title: 'Cas pratique TVA — entreprise X', dueDate: '2026-10-05', status: 'in_progress' as const, moduleTitle: 'TVA & cas spéciaux' },
    { id: 'ex-4', title: 'QCM TVA déductible', dueDate: '2026-10-12', status: 'todo' as const, moduleTitle: 'TVA & cas spéciaux' },
  ];

  type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
  type ComplaintEvent = { kind: 'created' | 'comment' | 'status_change' | 'resolution'; at: string; by: string; text: string };
  type ComplaintItem = {
    id: string;
    reference: string;
    subject: string;
    category: string;
    status: ComplaintStatus;
    createdAt: string;
    events: ComplaintEvent[];
  };

  const orgLabel = real?.dashboard.organization.name ?? 'votre OF';

  // Mapper les events RPC (kind: 'comment' | 'status_change' | 'assignment' | 'resolution')
  // vers le format UI attendu, et préfixer avec un événement 'created'.
  const mapRealComplaints = (cs: RealComplaint[]): ComplaintItem[] =>
    cs.map((c) => {
      const events: ComplaintEvent[] = [
        { kind: 'created', at: c.created_at, by: 'Vous', text: 'Réclamation envoyée' },
        ...c.events.map((e) => {
          const payload = e.payload as { by?: string; text?: string; from_learner?: boolean };
          const isFromLearner = payload.from_learner === true;
          const by = isFromLearner ? 'Vous' : (payload.by as string) ?? orgLabel;
          let text = (payload.text as string) ?? '';
          if (e.kind === 'status_change') {
            const to = (payload as { to?: string }).to;
            text = text || (to ? `Statut → ${to}` : 'Changement de statut');
          }
          if (e.kind === 'resolution' && !text && c.resolution) {
            text = c.resolution;
          }
          const kind: ComplaintEvent['kind'] =
            e.kind === 'status_change' ? 'status_change'
            : e.kind === 'resolution' ? 'resolution'
            : 'comment';
          return { kind, at: e.occurred_at, by, text };
        }),
      ];
      // Dédupe : si l'événement initial RPC ressemble au 'created' artificiel, on l'enlève
      const filtered = events.filter((ev, i) => !(i === 1 && ev.by === 'Vous' && ev.kind === 'comment' && ev.text.toLowerCase().includes('envoy')));
      return {
        id: c.id,
        reference: c.reference,
        subject: c.subject,
        category: c.category,
        status: c.status,
        createdAt: c.created_at,
        events: filtered,
      };
    });

  const mockComplaints: ComplaintItem[] = [
    {
      id: 'rec-1',
      reference: 'REC-2026-A4F2K9',
      subject: 'Problème de son lors de la session du 15 septembre',
      category: 'Organisation / logistique',
      status: 'resolved',
      createdAt: '2026-09-16T09:12:00Z',
      events: [
        { kind: 'created', at: '2026-09-16T09:12:00Z', by: 'Vous', text: 'Réclamation envoyée' },
        { kind: 'comment', at: '2026-09-16T14:30:00Z', by: orgLabel, text: 'Bonjour, nous avons bien reçu votre signalement. Nous investiguons côté équipement audio.' },
        { kind: 'status_change', at: '2026-09-17T10:00:00Z', by: orgLabel, text: 'Statut → En cours de traitement' },
        { kind: 'resolution', at: '2026-09-19T16:45:00Z', by: orgLabel, text: 'Le micro de la salle 3 a été remplacé. Une session de rattrapage de 30 min vous est offerte le 22/09.' },
      ],
    },
    {
      id: 'rec-2',
      reference: 'REC-2026-B8M3X1',
      subject: 'Demande d\'aménagement pour accessibilité',
      category: 'Accessibilité',
      status: 'in_progress',
      createdAt: '2026-10-02T11:30:00Z',
      events: [
        { kind: 'created', at: '2026-10-02T11:30:00Z', by: 'Vous', text: 'Réclamation envoyée' },
        { kind: 'comment', at: '2026-10-02T15:00:00Z', by: orgLabel, text: 'Merci pour votre demande. Notre référente handicap vous contacte sous 48h.' },
        { kind: 'status_change', at: '2026-10-03T09:15:00Z', by: orgLabel, text: 'Statut → En cours de traitement · Assignée à la référente handicap' },
      ],
    },
  ];

  const myComplaints: ComplaintItem[] = real ? mapRealComplaints(real.complaints) : mockComplaints;

  const complaintStatusConfig: Record<ComplaintStatus, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
    open: {
      label: 'Ouverte',
      tone: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
      icon: Inbox,
    },
    in_progress: {
      label: 'En cours',
      tone: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
      icon: Hourglass,
    },
    resolved: {
      label: 'Résolue',
      tone: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
      icon: CheckCircle2,
    },
    closed: {
      label: 'Clôturée',
      tone: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
      icon: XCircle,
    },
  };

  const formatTimelineDate = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="bg-gradient-to-br from-zinc-50 via-violet-50/30 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/15 dark:to-zinc-950 min-h-[calc(100vh-3rem)]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero */}
        <section className="mb-8">
          <p className="text-[12px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-2">Espace apprenant</p>
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-1">
            Bonjour {learner.firstName} 👋
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            Tout ce dont vous avez besoin pour votre formation, au même endroit.
          </p>
        </section>

        {/* Dossier card */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <GraduationCap className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{dossier.reference}</p>
                  <p className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{formation?.title}</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      du {new Date(dossier.startDate).toLocaleDateString('fr-FR')} au {new Date(dossier.endDate).toLocaleDateString('fr-FR')}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dossier.totalHours} h
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <span>{modalityLabel[dossier.modality]}</span>
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1 flex-shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" /> En cours
              </span>
            </div>

            {trainer && (
              <div className="flex items-center gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                  {trainer.firstName[0]}{trainer.lastName[0]}
                </span>
                <div>
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                    Votre formateur : {trainer.firstName} {trainer.lastName}
                  </p>
                  <a href={`mailto:${trainer.email}`} className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline">
                    {trainer.email}
                  </a>
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[12px] text-zinc-600 dark:text-zinc-400 font-medium">
                  Progression — {sessionsDone}/{sessions.length} séances
                </p>
                <p className="text-[12px] text-zinc-900 dark:text-zinc-100 font-semibold tabular-nums">{progress} %</p>
              </div>
              <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Sub-nav (ancres) */}
        <nav className="sticky top-0 z-20 -mx-6 px-6 py-2 mb-6 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-200/60 dark:border-zinc-800 overflow-x-auto scrollbar-thin">
          <ul className="flex items-center gap-1 text-[12px] font-medium whitespace-nowrap">
            {[
              { href: '#sessions', label: 'Sessions & replays', icon: Video },
              { href: '#documents', label: 'Documents', icon: FileText },
              { href: '#supports', label: 'Supports', icon: BookOpen },
              { href: '#exercices', label: 'Exercices', icon: PenLine },
              { href: '#mes-reclamations', label: 'Mes réclamations', icon: Inbox },
              { href: '#reclamation', label: 'Nouvelle réclamation', icon: MessageSquareWarning },
            ].map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-700 dark:hover:text-violet-300 transition"
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sessions & replays */}
        <Section id="sessions" icon={Video} title="Sessions & replays" subtitle={`${sessions.length} séances planifiées sur votre parcours.`}>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -my-3">
            {sessions.map((s) => {
              const isDone = s.status === 'done';
              const isLive = s.status === 'in_progress';
              return (
                <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isDone ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' :
                      isLive ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 animate-pulse' :
                      'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                    }`}>
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : isLive ? <Play className="w-4 h-4" /> : <CircleDashed className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 capitalize truncate">
                        {formatSessionDate(s.startsAt)}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {formatSessionTime(s.startsAt)} – {formatSessionTime(s.endsAt)}
                        {s.location && ` · ${s.location}`}
                      </p>
                    </div>
                  </div>
                  {isDone ? (
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition flex-shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      Replay
                    </a>
                  ) : isLive ? (
                    <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">En cours</span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">à venir</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Documents */}
        <Section id="documents" icon={FileText} title="Documents administratifs" subtitle="Conventions, programmes, attestations.">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 -my-1">
            {adminDocs.map((doc) => {
              const isPending = doc.status === 'pending';
              return (
                <li
                  key={doc.id}
                  className={`flex items-center justify-between gap-3 px-3 py-3 -mx-3 rounded-lg ${
                    isPending ? 'opacity-60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-950 transition cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      doc.status === 'signed' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' :
                      isPending ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400' :
                      'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    }`}>
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {doc.type} {doc.size !== '—' && `· ${doc.size}`} · {doc.date}
                      </p>
                    </div>
                  </div>
                  {isPending ? (
                    <span className="text-[10px] text-zinc-400 flex-shrink-0">en attente</span>
                  ) : (
                    <Download className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Supports pédagogiques */}
        <Section id="supports" icon={BookOpen} title="Supports & ressources" subtitle="Slides, fiches mémo, modèles distribués par votre formateur.">
          <div className="space-y-5 -my-1">
            {modules.map((mod) => {
              const supports = supportsByModule[mod.id] ?? [];
              return (
                <div key={mod.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[11px] font-medium">
                      {mod.position + 1}
                    </span>
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{mod.title}</p>
                    <span className="text-[10px] text-zinc-400 font-mono">{mod.durationHours} h</span>
                  </div>
                  {supports.length === 0 ? (
                    <p className="text-[11px] text-zinc-400 ml-8">Aucun support disponible pour le moment.</p>
                  ) : (
                    <ul className="space-y-1 ml-8">
                      {supports.map((s, i) => (
                        <li key={i}>
                          <a
                            href="#"
                            className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                              <span className="text-[12px] text-zinc-900 dark:text-zinc-100 truncate">{s.title}</span>
                              <span className="text-[10px] text-zinc-400 font-mono">{s.type} · {s.size}</span>
                            </div>
                            <Download className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Exercices */}
        <Section id="exercices" icon={PenLine} title="Exercices & devoirs" subtitle="Travaux à rendre tout au long de la formation.">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -my-3">
            {exercises.map((ex) => {
              const Icon = ex.status === 'submitted' ? CheckCircle2 : ex.status === 'in_progress' ? CircleDashed : Award;
              const tone =
                ex.status === 'submitted' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' :
                ex.status === 'in_progress' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' :
                'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400';
              const label =
                ex.status === 'submitted' ? 'Rendu' :
                ex.status === 'in_progress' ? 'En cours' : 'À faire';
              return (
                <li key={ex.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{ex.title}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {ex.moduleTitle} · à rendre le {new Date(ex.dueDate).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${tone}`}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Mes réclamations — historique + suivi */}
        <Section
          id="mes-reclamations"
          icon={Inbox}
          title="Mes réclamations"
          subtitle={
            myComplaints.length === 0
              ? 'Vous n\'avez pas encore envoyé de réclamation.'
              : `${myComplaints.length} réclamation${myComplaints.length > 1 ? 's' : ''} · suivi temps réel par votre OF.`
          }
        >
          {myComplaints.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Pas de réclamation en cours. Si quelque chose ne va pas, signalez-le ci-dessous 👇
              </p>
            </div>
          ) : (
            <ul className="space-y-3 -my-1">
              {myComplaints.map((c) => {
                const cfg = complaintStatusConfig[c.status];
                const StatusIcon = cfg.icon;
                return (
                  <li key={c.id}>
                    <details className="group bg-zinc-50/60 dark:bg-zinc-950/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl overflow-hidden transition hover:border-zinc-300/60 dark:hover:border-zinc-700">
                      <summary className="flex items-start gap-3 p-4 cursor-pointer list-none">
                        <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.tone}`}>
                          <StatusIcon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                              {c.subject}
                            </p>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.tone}`}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-zinc-400">{c.reference}</span>
                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                            <span>{c.category}</span>
                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                            <span>Ouvert le {new Date(c.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-1 transition group-open:rotate-90" />
                      </summary>

                      {/* Timeline */}
                      <div className="border-t border-zinc-200/60 dark:border-zinc-800 px-4 py-4 bg-white dark:bg-zinc-900">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-3">Suivi</p>
                        <ol className="space-y-3">
                          {c.events.map((ev, i) => {
                            const isLast = i === c.events.length - 1;
                            const dotColor =
                              ev.kind === 'created' ? 'bg-blue-500'
                              : ev.kind === 'resolution' ? 'bg-emerald-500'
                              : ev.kind === 'status_change' ? 'bg-violet-500'
                              : 'bg-zinc-400';
                            const isFromYou = ev.by === 'Vous';
                            return (
                              <li key={i} className="flex gap-3 relative">
                                <div className="flex flex-col items-center flex-shrink-0">
                                  <span className={`w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-white dark:ring-zinc-900 z-10 mt-1`} />
                                  {!isLast && (
                                    <span className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 mt-0.5" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 pb-1">
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className={`text-[12px] font-medium ${isFromYou ? 'text-violet-700 dark:text-violet-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                      {ev.by}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 font-mono">{formatTimelineDate(ev.at)}</span>
                                  </div>
                                  <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
                                    {ev.text}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>

                        {(c.status === 'open' || c.status === 'in_progress') && (
                          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                              <Hourglass className="w-3 h-3 text-amber-500" />
                              Réponse sous 15 jours ouvrés (engagement Qualiopi).
                            </p>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Réclamation */}
        <Section id="reclamation" icon={MessageSquareWarning} title="Faire une réclamation" subtitle="Conformément à nos engagements Qualiopi, vous pouvez nous signaler tout dysfonctionnement.">
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg px-3 py-2.5 mb-5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-900 dark:text-amber-200">
              Nous nous engageons à vous répondre sous <strong className="font-semibold">15 jours ouvrés</strong>. Les réclamations sont traitées de façon confidentielle.
            </p>
          </div>
          <form action={submitComplaint} className="space-y-4">
            <input type="hidden" name="token" value={params.token} />
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Type de réclamation <span className="text-rose-500">*</span>
              </span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { v: 'pedagogie', l: 'Contenu / pédagogie' },
                  { v: 'organisation', l: 'Organisation / logistique' },
                  { v: 'accessibilite', l: 'Accessibilité' },
                  { v: 'administratif', l: 'Administratif' },
                  { v: 'relation', l: 'Relation formateur' },
                  { v: 'autre', l: 'Autre' },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition"
                  >
                    <input type="radio" name="category" value={opt.v} required className="sr-only" />
                    <p className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{opt.l}</p>
                  </label>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Sujet <span className="text-rose-500">*</span>
              </span>
              <input
                type="text"
                name="subject"
                required
                placeholder="En une phrase, l'objet de votre réclamation"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition"
              />
            </label>

            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Description détaillée <span className="text-rose-500">*</span>
              </span>
              <textarea
                name="description"
                required
                rows={5}
                placeholder="Décrivez la situation, les éléments factuels et la solution que vous attendez."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Envoyé en votre nom : <strong className="font-medium text-zinc-700 dark:text-zinc-300">{learner.firstName} {learner.lastName}</strong>
              </p>
              <button
                type="submit"
                className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                Envoyer ma réclamation
              </button>
            </div>
          </form>
        </Section>

        {/* Footer */}
        <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400 my-8 inline-flex items-center justify-center gap-1.5 w-full">
          <Sparkles className="w-3 h-3 text-violet-500" />
          Espace propulsé par i-a-infinity · accès sécurisé personnel
        </p>
      </div>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 mb-6 scroll-mt-20">
      <header className="flex items-start gap-3 mb-5">
        <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{title}</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
