// ARCHETYPE: command
// Justification: fiche détail formation — KPIs, programme, dossiers liés, lien d'inscription publique.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Video,
  MapPin,
  GraduationCap,
  BookOpen,
  Eye,
  EyeOff,
  Users as UsersIcon,
  Banknote,
  FileText,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formations, dossiers, learners, trainers, formatEuros } from '@/shared/mock/data';
import { CopyInscriptionLink } from '@/shared/ui/copy-inscription-link';

const modalityStyles = {
  presentiel: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400', icon: MapPin, label: 'Présentiel' },
  distanciel: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', icon: Video, label: 'Distanciel' },
  hybride: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', icon: GraduationCap, label: 'Hybride' },
  afest: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: BookOpen, label: 'AFEST' },
};

const statusStyles = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  scheduled: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  completed: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  closed: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  draft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  pending_validation: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  archived: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500',
  cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
};

const statusLabel: Record<string, string> = {
  active: 'En cours',
  scheduled: 'Planifié',
  completed: 'Terminé',
  closed: 'Clos',
  draft: 'Brouillon',
  pending_validation: 'À valider',
  archived: 'Archivé',
  cancelled: 'Annulé',
};

export default function FormationDetailPage({ params }: { params: { id: string } }) {
  const formation = formations.find((f) => f.id === params.id);
  if (!formation) return notFound();

  const m = modalityStyles[formation.modality];
  const Icon = m.icon;

  const relatedDossiers = dossiers.filter((d) => d.formationId === formation.id);
  const activeCount = relatedDossiers.filter((d) => d.status === 'active' || d.status === 'scheduled').length;
  const totalRevenue = relatedDossiers
    .filter((d) => d.status === 'active' || d.status === 'completed' || d.status === 'closed')
    .reduce((acc, d) => acc + (d.totalAmountCents ?? 0), 0);
  const totalSessions = relatedDossiers.reduce((acc, d) => acc + d.sessionsCount, 0);

  // Mock additional content
  const description =
    "Formation pratique conçue pour les professionnels souhaitant maîtriser les fondamentaux et les bonnes pratiques de leur métier. Mises en situation, études de cas et exercices pratiques jalonnent l'ensemble du parcours.";
  const targetAudience =
    "Salariés, indépendants ou demandeurs d'emploi souhaitant monter en compétences. Prérequis : connaissances de base dans le domaine. Niveau d'entrée évalué lors de la pré-inscription.";
  const objectives = [
    'Maîtriser les concepts fondamentaux du domaine',
    'Appliquer les bonnes pratiques en situation réelle',
    'Identifier les écueils courants et les contourner',
    'Élaborer un plan d\'action adapté à son contexte',
  ];
  const program = [
    { title: 'Module 1 — Fondamentaux', hours: Math.floor(formation.defaultHours * 0.25) },
    { title: 'Module 2 — Mises en pratique', hours: Math.floor(formation.defaultHours * 0.35) },
    { title: 'Module 3 — Études de cas', hours: Math.floor(formation.defaultHours * 0.25) },
    { title: 'Module 4 — Évaluation & plan d\'action', hours: Math.floor(formation.defaultHours * 0.15) },
  ];

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-8">
      <Link
        href="/formations"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour au catalogue
      </Link>

      <header className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <span className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${m.bg}`}>
              <Icon className={`w-6 h-6 ${m.text}`} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 mb-1">{formation.code}</p>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {formation.title}
              </h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${m.bg} ${m.text}`}>
                  <Icon className="w-2.5 h-2.5" />
                  {m.label}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <Clock className="w-2.5 h-2.5" />
                  {formation.defaultHours} h
                </span>
                <span className={
                  formation.isPublished
                    ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1'
                    : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 inline-flex items-center gap-1'
                }>
                  {formation.isPublished ? (<><Eye className="w-2.5 h-2.5" /> publiée</>) : (<><EyeOff className="w-2.5 h-2.5" /> brouillon</>)}
                </span>
              </div>
            </div>
          </div>
          <CopyInscriptionLink formationId={formation.id} variant="full" />
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Apprenants actifs" value={activeCount} icon={UsersIcon} accent="rose" />
        <KpiTile label="Sessions" value={totalSessions} icon={Clock} accent="blue" hint="cumul historique" />
        <KpiTile label="CA généré" value={formatEuros(totalRevenue)} icon={Banknote} accent="amber" hint="actifs + clos" />
        <KpiTile label="Dossiers" value={relatedDossiers.length} icon={FileText} accent="violet" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Description">
            <p className="text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {description}
            </p>
          </Card>

          <Card title="Public visé & prérequis">
            <p className="text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {targetAudience}
            </p>
          </Card>

          <Card title="Objectifs pédagogiques">
            <ul className="space-y-2">
              {objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-[14px] text-zinc-600 dark:text-zinc-400">
                  <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[11px] font-medium flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {o}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Programme">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -my-3">
              {program.map((p, i) => (
                <li key={i} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{p.title}</p>
                  </div>
                  <span className="text-[12px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">{p.hours} h</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Lien d'inscription publique">
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
              Partagez ce lien sur votre site, vos réseaux ou par email. Les pré-inscriptions arrivent dans votre tableau de bord.
            </p>
            <div className="bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 mb-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 break-all">
              /inscription?formation={formation.id}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <CopyInscriptionLink formationId={formation.id} variant="full" />
              <Link
                href={`/inscription?formation=${formation.id}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition"
              >
                <ExternalLink className="w-3 h-3" />
                Ouvrir
              </Link>
            </div>
          </Card>

          <Card title={`Dossiers (${relatedDossiers.length})`}>
            {relatedDossiers.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Aucun dossier rattaché à cette formation pour le moment.
              </p>
            ) : (
              <ul className="space-y-2 -my-1">
                {relatedDossiers.slice(0, 6).map((d) => {
                  const learner = learners.find((l) => l.id === d.learnerId);
                  const trainer = trainers.find((t) => d.trainerIds.includes(t.id));
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/dossiers/${d.id}`}
                        className="block px-3 py-2 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[11px] text-zinc-400">{d.reference}</p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyles[d.status] ?? statusStyles.draft}`}>
                            {statusLabel[d.status] ?? d.status}
                          </span>
                        </div>
                        {learner && (
                          <p className="text-[13px] text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                            {learner.firstName} {learner.lastName}
                          </p>
                        )}
                        {trainer && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            avec {trainer.firstName} {trainer.lastName}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const accentStyles: Record<string, string> = {
  rose: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400',
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
};

function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'rose' | 'blue' | 'amber' | 'violet';
  hint?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">{label}</p>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentStyles[accent]}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-3 h-3 text-violet-500" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">{title}</p>
      </div>
      {children}
    </div>
  );
}
