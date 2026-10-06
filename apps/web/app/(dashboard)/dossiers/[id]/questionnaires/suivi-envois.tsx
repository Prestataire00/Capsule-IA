import Link from 'next/link';
import { CheckCircle2, ClipboardPen, Hourglass, Mail, Percent, Send } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { KpiCard } from '@/shared/ui/kpi-card';
import { StatusPill } from '@/shared/ui/status-pill';
import {
  LIBELLE_DESTINATAIRE,
  compterEnvois,
  etatCourriel,
  etatEnvoi,
  libelleCourriel,
  type Courriel,
  type Destinataire,
  type EnvoiQuestionnaire,
} from '@/features/questionnaire/suivi-envois';
import { Relancer } from './relancer.client';

const PASTILLE: Record<Destinataire, string> = {
  learner: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  company_rep: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  trainer: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
  funder: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
};

const jour = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
const jourHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });

const TH = 'text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400';
const TD = 'px-4 py-3 align-top';
const BOUTON =
  'h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800';

export function SuiviEnvois({
  dossierId,
  envois,
  courriels,
}: {
  dossierId: string;
  envois: readonly EnvoiQuestionnaire[];
  courriels: readonly Courriel[];
}) {
  const maintenant = new Date();
  const n = compterEnvois(envois);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Envoyés" value={n.envoyes} icon={Send} accent="blue" />
        <KpiCard label="Répondus" value={n.repondus} icon={CheckCircle2} accent="emerald" />
        <KpiCard label="En attente" value={n.enAttente} icon={Hourglass} accent="amber" />
        <KpiCard label="Taux de réponse" value={n.tauxReponse === null ? '—' : `${n.tauxReponse} %`} icon={Percent} accent="purple" />
      </div>

      <div className="space-y-3">
        <SectionLabel>Suivi des questionnaires</SectionLabel>
        {envois.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-8 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun questionnaire envoyé pour ce dossier. Ceux qui partent automatiquement (fiche besoin, évaluations de
            fin, satisfaction) apparaîtront ici.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="border-b border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th className={TH}>Questionnaire</th>
                  <th className={TH}>Destinataire</th>
                  <th className={TH}>Envoyé le</th>
                  <th className={TH}>Relances</th>
                  <th className={TH}>État</th>
                  <th className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {envois.map((e) => {
                  const etat = etatEnvoi(e, maintenant);
                  const repondu = e.status === 'completed';
                  return (
                    <tr key={e.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className={TD}>
                        <Link
                          href={`/questionnaires/${e.modeleId}/apercu`}
                          title="Lire le questionnaire"
                          className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-400 hover:underline"
                        >
                          {e.questionnaire}
                        </Link>
                      </td>
                      <td className={TD}>
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PASTILLE[e.destinataire]}`}>
                            {LIBELLE_DESTINATAIRE[e.destinataire]}
                          </span>
                          <span className="text-[13px] text-zinc-800 dark:text-zinc-200">{e.nom}</span>
                        </span>
                        {e.email && e.email !== e.nom && (
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{e.email}</span>
                        )}
                      </td>
                      <td className={`${TD} text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums`}>{jour(e.envoyeLe)}</td>
                      <td className={`${TD} text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums`}>
                        {e.relances === 0 ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          <>
                            {e.relances}
                            {e.derniereRelance && (
                              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                                dernière le {jour(e.derniereRelance)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className={TD}>
                        <StatusPill tone={etat.ton}>{etat.libelle}</StatusPill>
                        {e.reponduLe && (
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                            le {jour(e.reponduLe)}
                          </span>
                        )}
                        {!repondu && e.echeance && (
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                            avant le {jour(e.echeance)}
                          </span>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        <span className="inline-flex items-start justify-end gap-2">
                          {repondu ? (
                            <a href={`/api/questionnaires/${e.id}`} target="_blank" rel="noopener noreferrer" className={BOUTON}>
                              Voir la réponse
                            </a>
                          ) : (
                            <>
                              {e.destinataire === 'learner' && (
                                <Link href={`/dossiers/${dossierId}/questionnaires/${e.id}/saisie`} className={BOUTON}>
                                  <ClipboardPen className="w-3.5 h-3.5" /> Saisir
                                </Link>
                              )}
                              {e.status !== 'expired' && <Relancer assignmentId={e.id} dossierId={dossierId} />}
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionLabel>E-mails partis</SectionLabel>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Les liens des stagiaires partent souvent dans un seul e-mail au référent de l’entreprise. « Lu » et « Lien
          ouvert » ne s’affichent que pour les e-mails envoyés depuis contact@ ; ceux de la boîte des cours restent à
          « Envoyé ».
        </p>
        {courriels.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucun e-mail de questionnaire envoyé pour ce dossier.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th className={TH}>Envoyé</th>
                  <th className={TH}>Destinataire</th>
                  <th className={TH}>Objet</th>
                  <th className={TH}>État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {courriels.map((c) => {
                  const etat = etatCourriel(c);
                  return (
                    <tr key={c.id}>
                      <td className={`${TD} text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums whitespace-nowrap`}>
                        {c.envoyeLe ? jourHeure(c.envoyeLe) : '—'}
                      </td>
                      <td className={`${TD} text-[13px] text-zinc-800 dark:text-zinc-200`}>
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-zinc-400" aria-hidden /> {c.destinataire}
                        </span>
                      </td>
                      <td className={TD}>
                        <span className="block text-[13px] text-zinc-800 dark:text-zinc-200">{libelleCourriel(c.kind)}</span>
                        {c.sujet && <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[360px]">{c.sujet}</span>}
                      </td>
                      <td className={TD}>
                        <StatusPill tone={etat.ton}>{etat.libelle}</StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
