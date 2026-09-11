import { ORG_STATUS_LABELS, type OrgStatus } from './status';

/**
 * Rendu du dossier de préparation à l'audit : une synthèse HTML autonome
 * (ouvrable hors ligne, liens vers les preuves jointes) et la liste des
 * dossiers au format CSV. Pur.
 */
export type LigneAudit = {
  readonly number: number;
  readonly criterion: number;
  readonly criterionLabel: string | null;
  readonly title: string;
  readonly requirement: string | null;
  readonly status: OrgStatus;
  readonly auto: boolean;
  readonly note: string | null;
  readonly evidence: readonly { label: string; ok: boolean }[];
  readonly preuves: readonly { title: string; chemin: string | null; validUntil: string | null; expiree: boolean }[];
};

export type SyntheseModel = {
  readonly organisme: string;
  readonly jour: string;
  readonly referentiel: string;
  readonly lignes: readonly LigneAudit[];
  readonly dossiers: { readonly total: number; readonly prets: number };
};

export type DossierCsvRow = {
  readonly reference: string;
  readonly apprenant: string;
  readonly formation: string;
  readonly statut: string;
  readonly satisfaits: number;
  readonly applicables: number;
  readonly bloquants: number;
  readonly pret: boolean;
};

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COULEUR: Record<OrgStatus, string> = {
  conforme: '#047857',
  en_cours: '#1d4ed8',
  a_traiter: '#b45309',
  non_applicable: '#71717a',
};

function ligne(l: LigneAudit): string {
  const statut = `${ORG_STATUS_LABELS[l.status]}${l.auto && l.status !== 'a_traiter' ? ' (constaté)' : ''}`;
  const evidence = l.evidence.length
    ? `<ul>${l.evidence.map((e) => `<li>${e.ok ? '✓' : '·'} ${esc(e.label)}</li>`).join('')}</ul>`
    : '';
  const preuves = l.preuves.length
    ? `<ul>${l.preuves
        .map((p) => {
          const titre = p.chemin ? `<a href="${esc(p.chemin)}">${esc(p.title)}</a>` : `${esc(p.title)} <em>(fichier non joint)</em>`;
          const validite = p.validUntil ? ` — valable jusqu’au ${esc(p.validUntil)}${p.expiree ? ' <strong>(expirée)</strong>' : ''}` : '';
          return `<li>${titre}${validite}</li>`;
        })
        .join('')}</ul>`
    : '';
  const note = l.note ? `<p class="note">${esc(l.note)}</p>` : '';
  return `<tr>
<td class="num">I${l.number}</td>
<td><strong>${esc(l.title)}</strong>${l.requirement ? `<p class="req">${esc(l.requirement)}</p>` : ''}</td>
<td class="st" style="color:${COULEUR[l.status]}">${esc(statut)}</td>
<td>${evidence}${preuves ? `<p class="lbl">Preuves déposées</p>${preuves}` : ''}${note}</td>
</tr>`;
}

export function renderSynthese(m: SyntheseModel): string {
  const applicables = m.lignes.filter((l) => l.status !== 'non_applicable');
  const conformes = applicables.filter((l) => l.status === 'conforme').length;
  const criteres = [...new Set(m.lignes.map((l) => l.criterion))].sort((a, b) => a - b);

  const sections = criteres
    .map((c) => {
      const du = m.lignes.filter((l) => l.criterion === c).sort((a, b) => a.number - b.number);
      const label = du[0]?.criterionLabel ?? '';
      return `<h2>Critère ${c}${label ? ` — ${esc(label)}` : ''}</h2>
<table><thead><tr><th>N°</th><th>Indicateur</th><th>Statut</th><th>Éléments</th></tr></thead>
<tbody>${du.map(ligne).join('\n')}</tbody></table>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Préparation à l’audit Qualiopi — ${esc(m.organisme)}</title>
<style>
body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#27272a;max-width:1100px;margin:32px auto;padding:0 24px;font-size:13px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;color:#6d28d9}
.meta{color:#71717a;margin:0 0 20px}
table{width:100%;border-collapse:collapse}th,td{border-top:1px solid #e4e4e7;padding:8px;vertical-align:top;text-align:left}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#71717a}
.num{font-family:ui-monospace,monospace;white-space:nowrap}.st{white-space:nowrap}
.req{color:#52525b;margin:4px 0 0}.lbl{font-size:11px;color:#71717a;margin:6px 0 0}
.note{background:#fafafa;border-left:3px solid #a1a1aa;padding:4px 8px;margin:6px 0 0}
ul{margin:4px 0 0;padding-left:18px}
@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>Préparation à l’audit Qualiopi</h1>
<p class="meta">${esc(m.organisme)} · export du ${esc(m.jour)} · référentiel national qualité, ${esc(m.referentiel)}</p>
<p><strong>${conformes}/${applicables.length}</strong> indicateurs applicables conformes · ${m.lignes.length - applicables.length} non applicables · ${m.dossiers.prets}/${m.dossiers.total} dossiers prêts (détail dans dossiers.csv)</p>
${sections}
</body></html>
`;
}

/** Cellule CSV : échappement, et neutralisation des formules (=, +, -, @). */
function cellule(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function renderDossiersCsv(rows: readonly DossierCsvRow[]): string {
  const entete = ['Référence', 'Apprenant', 'Formation', 'Statut', 'Indicateurs satisfaits', 'Indicateurs applicables', 'Bloquants', 'Prêt pour l’audit'];
  const corps = rows.map((r) => [r.reference, r.apprenant, r.formation, r.statut, r.satisfaits, r.applicables, r.bloquants, r.pret ? 'oui' : 'non']);
  return `﻿${[entete, ...corps].map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`;
}
