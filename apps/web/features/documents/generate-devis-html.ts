// Corps HTML d'un devis de formation. Pur : aucun import next/supabase/react.
// Le HTML (et non un PDF) est volontaire : l'aperçu, la signature électronique
// et l'impression des documents fonctionnent sur `content_html`. Le devis est
// régénéré à chaque modification de ses lignes.

import type { QuoteClientKind, QuoteLineInput, QuoteTotals } from '@/features/billing/domain/quote';

export type DevisOrg = {
  name: string;
  legalName: string | null;
  siret: string | null;
  nda: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type DevisClient = {
  kind: QuoteClientKind;
  /** Raison sociale (entreprise) ou nom complet (particulier). */
  name: string;
  siret: string | null;
  address: string | null;
  /** Responsable destinataire (entreprise). */
  attention: string | null;
  email: string | null;
  phone: string | null;
};

export type DevisSession = { startsAt: string; endsAt: string; location: string | null };

export type QuoteHtmlInput = {
  reference: string;
  issuedOn: string;
  validUntil: string;
  object: string;
  notes: string | null;
  org: DevisOrg;
  client: DevisClient;
  formation: { title: string; durationHours: number | null; modality: string | null };
  sessions: DevisSession[];
  learners: string[];
  lines: QuoteLineInput[];
  totals: QuoteTotals;
  vatRate: number;
};

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

const euros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const esc = (v: string | null | undefined): string =>
  (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const frDate = (iso: string): string =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

const frTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

const cell = 'padding:8px;border:1px solid #e4e4e7;';

function sessionLines(sessions: DevisSession[]): string {
  if (sessions.length === 0) return 'À convenir';
  return sessions
    .map((s) => `${frDate(s.startsAt)} de ${frTime(s.startsAt)} à ${frTime(s.endsAt)}`)
    .join('<br>');
}

export function buildDevisHtml(input: QuoteHtmlInput): string {
  const isCompany = input.client.kind === 'company';
  const exempt = input.totals.byRate.every((r) => r.rate === 0);

  const clientLines = [
    `<strong>${esc(input.client.name)}</strong>`,
    input.client.siret ? `SIRET ${esc(input.client.siret)}` : null,
    esc(input.client.address) || null,
    isCompany && input.client.attention ? `À l'attention de ${esc(input.client.attention)}` : null,
    esc(input.client.email) || null,
    esc(input.client.phone) || null,
  ]
    .filter(Boolean)
    .map((l) => `<div>${l}</div>`)
    .join('');

  const orgLines = [
    input.org.legalName || input.org.name,
    input.org.address,
    input.org.siret ? `SIRET ${input.org.siret}` : null,
    input.org.nda ? `Déclaration d'activité n° ${input.org.nda}` : null,
    [input.org.contactEmail, input.org.contactPhone].filter(Boolean).join(' · ') || null,
  ]
    .filter(Boolean)
    .map((l) => `<div>${esc(String(l))}</div>`)
    .join('');

  const locations = [...new Set(input.sessions.map((s) => s.location).filter((l): l is string => !!l))];
  const details: Array<[string, string]> = [
    ['Intitulé', esc(input.formation.title)],
    ['Durée', input.formation.durationHours ? `${input.formation.durationHours} h` : '—'],
    [
      'Modalité',
      input.formation.modality ? esc(MODALITY_LABELS[input.formation.modality] ?? input.formation.modality) : '—',
    ],
    ['Dates', sessionLines(input.sessions)],
    ['Lieu', locations.length ? locations.map(esc).join(', ') : '—'],
    [
      input.learners.length > 1 ? 'Stagiaires' : 'Stagiaire',
      input.learners.length ? input.learners.map(esc).join(', ') : '—',
    ],
  ];

  const lineRows = input.lines
    .map((l) => {
      const rate = l.vatRate ?? input.vatRate;
      return `<tr>
      <td style="${cell}">${esc(l.description)}${
        l.details ? `<div style="font-size:11px;color:#71717a;font-style:italic;margin-top:2px;">${esc(l.details)}</div>` : ''
      }</td>
      <td style="${cell}text-align:center;">${Number(l.quantity).toLocaleString('fr-FR')}</td>
      <td style="${cell}text-align:right;">${euros(l.unitAmountCents)}</td>
      ${exempt ? '' : `<td style="${cell}text-align:center;">${rate} %</td>`}
      <td style="${cell}text-align:right;">${euros(Math.round(l.quantity * l.unitAmountCents))}</td>
    </tr>`;
    })
    .join('');

  const vatRows = exempt
    ? `<tr><td style="padding-right:24px;">TVA</td><td style="text-align:right">Exonération — art. 261-4-4°a du CGI</td></tr>`
    : input.totals.byRate
        .map(
          (r) =>
            `<tr><td style="padding-right:24px;">TVA ${r.rate} % (base ${euros(r.baseCents)})</td><td style="text-align:right">${euros(r.vatCents)}</td></tr>`,
        )
        .join('');

  const conditions = [
    `Devis valable jusqu'au ${frDate(input.validUntil)}.`,
    isCompany
      ? "L'acceptation du devis vaut commande : une convention de formation professionnelle (art. L.6353-1 et suivants du Code du travail) est établie avant le démarrage."
      : "L'acceptation du devis donne lieu à un contrat de formation professionnelle (art. L.6353-3 à L.6353-7 du Code du travail).",
    isCompany
      ? 'Règlement à 30 jours à réception de la facture, par virement. En cas de prise en charge par un OPCO, la subrogation de paiement doit nous être notifiée avant le démarrage.'
      : "Aucune somme ne peut être exigée avant l'expiration du délai de rétractation ; l'acompte éventuel est plafonné à 30 % du prix (art. L.6353-6 du Code du travail).",
    isCompany
      ? 'Pénalités de retard : trois fois le taux d’intérêt légal (art. L.441-10 du Code de commerce) et indemnité forfaitaire pour frais de recouvrement de 40 € (art. D.441-5).'
      : null,
    'Le programme détaillé de la formation est annexé au présent devis.',
  ]
    .filter(Boolean)
    .map((c) => `<li>${c}</li>`)
    .join('');

  const retractation = isCompany
    ? ''
    : `
<div style="page-break-before:always;"></div>
<h2 style="font-size:14px;margin:0 0 8px;">Annexe — Droit de rétractation</h2>
<p style="font-size:12px;line-height:1.6;margin:0 0 10px;">
  Vous disposez d'un délai de <strong>10 jours</strong> à compter de la signature du contrat de formation pour vous
  rétracter, par lettre recommandée avec avis de réception (art. L.6353-5 du Code du travail). Ce délai est porté à
  <strong>14 jours</strong> lorsque le contrat est conclu à distance ou hors établissement (art. L.221-18 du Code de la
  consommation). Aucune somme ne peut être exigée avant l'expiration de ce délai.
</p>
<div style="border:1px dashed #a1a1aa;padding:14px;font-size:12px;line-height:1.9;">
  <strong>Formulaire de rétractation</strong> — à compléter et renvoyer uniquement si vous souhaitez vous rétracter.<br>
  À l'attention de ${esc(input.org.legalName || input.org.name)}${input.org.address ? `, ${esc(input.org.address)}` : ''}${
    input.org.contactEmail ? ` — ${esc(input.org.contactEmail)}` : ''
  }.<br>
  Je notifie par la présente ma rétractation du contrat portant sur la formation ci-dessous :<br>
  Devis n° ${esc(input.reference)} — ${esc(input.formation.title)}<br>
  Nom du stagiaire : ${esc(input.client.name)}<br>
  Date : ____________________ &nbsp;&nbsp; Signature : ____________________
</div>`;

  return `
<h1 style="font-size:20px;margin:0 0 4px;">Devis n° ${esc(input.reference)}</h1>
<p style="font-size:12px;color:#71717a;margin:0 0 20px;">
  Établi le ${frDate(input.issuedOn)} — valable jusqu'au ${frDate(input.validUntil)}.
</p>

<table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:12px;line-height:1.6;">
  <tr>
    <td style="width:50%;vertical-align:top;padding-right:16px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;margin-bottom:4px;">Organisme de formation</div>
      ${orgLines}
    </td>
    <td style="width:50%;vertical-align:top;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;margin-bottom:4px;">${
        isCompany ? 'Client' : 'Client — à titre individuel'
      }</div>
      ${clientLines}
    </td>
  </tr>
</table>

<p style="font-size:12px;margin:0 0 14px;"><strong>Objet :</strong> ${esc(input.object)}</p>

<h2 style="font-size:14px;margin:0 0 8px;">Détails de la formation</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
  ${details
    .map(
      ([k, v]) =>
        `<tr><td style="${cell}width:28%;background:#fafafa;color:#52525b;">${k}</td><td style="${cell}">${v}</td></tr>`,
    )
    .join('')}
</table>

<h2 style="font-size:14px;margin:0 0 8px;">Prestation</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
  <thead>
    <tr style="background:#f4f4f5;">
      <th style="${cell}text-align:left;">Désignation</th>
      <th style="${cell}text-align:center;">Quantité</th>
      <th style="${cell}text-align:right;">${exempt ? 'Prix unit. net' : 'Prix unit. HT'}</th>
      ${exempt ? '' : `<th style="${cell}text-align:center;">TVA</th>`}
      <th style="${cell}text-align:right;">${exempt ? 'Total net' : 'Total HT'}</th>
    </tr>
  </thead>
  <tbody>${lineRows}</tbody>
</table>

<table style="margin-left:auto;font-size:12px;line-height:1.8;">
  <tr><td style="padding-right:24px;">Total HT</td><td style="text-align:right">${euros(input.totals.subtotalCents)}</td></tr>
  ${vatRows}
  <tr style="font-weight:700;border-top:1px solid #e4e4e7;">
    <td style="padding-right:24px;">${exempt ? 'Total net de taxe' : 'Total TTC'}</td>
    <td style="text-align:right">${euros(input.totals.totalCents)}</td>
  </tr>
</table>

${
  input.notes
    ? `<h2 style="font-size:14px;margin:22px 0 8px;">Informations complémentaires</h2><p style="font-size:12px;line-height:1.6;white-space:pre-line;margin:0;">${esc(input.notes)}</p>`
    : ''
}

<h2 style="font-size:14px;margin:22px 0 8px;">Conditions</h2>
<ul style="font-size:12px;line-height:1.7;padding-left:18px;margin:0 0 18px;">${conditions}</ul>
${retractation}
<table style="width:100%;font-size:12px;margin-top:26px;page-break-inside:avoid;">
  <tr>
    <td style="width:50%;vertical-align:top;">
      <div style="color:#71717a;">Pour l'organisme</div>
      <div style="margin-top:44px;border-top:1px solid #d4d4d8;padding-top:4px;">${esc(input.org.name)}</div>
    </td>
    <td style="width:50%;vertical-align:top;padding-left:24px;">
      <div style="color:#71717a;">Bon pour accord — date et signature</div>
      <div style="margin-top:44px;border-top:1px solid #d4d4d8;padding-top:4px;">
        ${esc(isCompany ? `${input.client.name}${input.client.attention ? ` — ${input.client.attention}` : ''}` : input.client.name)}
      </div>
    </td>
  </tr>
</table>`.trim();
}
