// Corps HTML d'un devis de formation. Pur : aucun import next/supabase/react.
// Le HTML (et non un PDF) est volontaire : l'aperçu et l'édition en place des
// documents ne fonctionnent que sur `content_html` — le devis doit pouvoir être
// relu et retouché avant d'être envoyé au client.

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
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  companySiret: string | null;
  companyAddress: string | null;
  referentName: string | null;
};

export type DevisInput = {
  reference: string;
  issuedOn: Date;
  validityDays: number;
  org: DevisOrg;
  client: DevisClient;
  formation: { title: string; durationHours: number | null; modality: string | null };
  /** Nombre de stagiaires : 1 pour un particulier, l'effectif du lot pour une entreprise. */
  quantity: number;
  unitPriceHtCents: number;
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

const date = (d: Date): string => d.toLocaleDateString('fr-FR');

export function buildDevisHtml(input: DevisInput): string {
  const totalHt = input.unitPriceHtCents * input.quantity;
  const vat = Math.round(totalHt * (input.vatRate / 100));
  const totalTtc = totalHt + vat;

  const expiresOn = new Date(input.issuedOn);
  expiresOn.setDate(expiresOn.getDate() + input.validityDays);

  const clientLines = [
    input.client.companyName ? `<strong>${esc(input.client.companyName)}</strong>` : null,
    input.client.companySiret ? `SIRET ${esc(input.client.companySiret)}` : null,
    input.client.companyAddress,
    input.client.companyName
      ? `À l'attention de ${esc(input.client.referentName || input.client.fullName)}`
      : `<strong>${esc(input.client.fullName)}</strong>`,
    input.client.email,
    input.client.phone,
  ]
    .filter(Boolean)
    .map((l) => `<div>${l}</div>`)
    .join('');

  const orgLines = [
    input.org.legalName || input.org.name,
    input.org.address,
    input.org.siret ? `SIRET ${esc(input.org.siret)}` : null,
    input.org.nda ? `Déclaration d'activité n° ${esc(input.org.nda)}` : null,
    [input.org.contactEmail, input.org.contactPhone].filter(Boolean).join(' · ') || null,
  ]
    .filter(Boolean)
    .map((l) => `<div>${esc(String(l))}</div>`)
    .join('');

  const duration = input.formation.durationHours ? `${input.formation.durationHours} h` : '—';
  const modality = input.formation.modality
    ? (MODALITY_LABELS[input.formation.modality] ?? input.formation.modality)
    : '—';

  // TVA à 0 % : l'organisme est exonéré (art. 261-4-4°a CGI) — la mention est
  // obligatoire sur la facture comme sur le devis.
  const vatLine =
    input.vatRate > 0
      ? `<tr><td>TVA (${input.vatRate} %)</td><td style="text-align:right">${euros(vat)}</td></tr>`
      : `<tr><td>TVA</td><td style="text-align:right">Non applicable — art. 261-4-4°a du CGI</td></tr>`;

  return `
<h1 style="font-size:20px;margin:0 0 4px;">Devis n° ${esc(input.reference)}</h1>
<p style="font-size:12px;color:#71717a;margin:0 0 20px;">
  Établi le ${date(input.issuedOn)} — valable jusqu'au ${date(expiresOn)} (${input.validityDays} jours).
</p>

<table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:12px;line-height:1.6;">
  <tr>
    <td style="width:50%;vertical-align:top;padding-right:16px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;margin-bottom:4px;">Organisme de formation</div>
      ${orgLines}
    </td>
    <td style="width:50%;vertical-align:top;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;margin-bottom:4px;">Client</div>
      ${clientLines}
    </td>
  </tr>
</table>

<h2 style="font-size:14px;margin:0 0 8px;">Prestation</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
  <thead>
    <tr style="background:#f4f4f5;">
      <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Formation</th>
      <th style="text-align:center;padding:8px;border:1px solid #e4e4e7;">Durée</th>
      <th style="text-align:center;padding:8px;border:1px solid #e4e4e7;">Modalité</th>
      <th style="text-align:center;padding:8px;border:1px solid #e4e4e7;">Stagiaires</th>
      <th style="text-align:right;padding:8px;border:1px solid #e4e4e7;">Prix unitaire HT</th>
      <th style="text-align:right;padding:8px;border:1px solid #e4e4e7;">Total HT</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:8px;border:1px solid #e4e4e7;">${esc(input.formation.title)}</td>
      <td style="padding:8px;border:1px solid #e4e4e7;text-align:center;">${duration}</td>
      <td style="padding:8px;border:1px solid #e4e4e7;text-align:center;">${modality}</td>
      <td style="padding:8px;border:1px solid #e4e4e7;text-align:center;">${input.quantity}</td>
      <td style="padding:8px;border:1px solid #e4e4e7;text-align:right;">${euros(input.unitPriceHtCents)}</td>
      <td style="padding:8px;border:1px solid #e4e4e7;text-align:right;">${euros(totalHt)}</td>
    </tr>
  </tbody>
</table>

<table style="margin-left:auto;font-size:12px;line-height:1.8;">
  <tr><td style="padding-right:24px;">Total HT</td><td style="text-align:right">${euros(totalHt)}</td></tr>
  ${vatLine}
  <tr style="font-weight:700;border-top:1px solid #e4e4e7;">
    <td style="padding-right:24px;">Total ${input.vatRate > 0 ? 'TTC' : 'net de taxe'}</td>
    <td style="text-align:right">${euros(totalTtc)}</td>
  </tr>
</table>

<h2 style="font-size:14px;margin:22px 0 8px;">Conditions</h2>
<ul style="font-size:12px;line-height:1.7;padding-left:18px;margin:0 0 18px;">
  <li>Devis valable ${input.validityDays} jours à compter de sa date d'établissement.</li>
  <li>L'acceptation vaut commande : une convention de formation professionnelle (art. L.6353-1 du Code du travail) sera établie avant le démarrage.</li>
  <li>Les dates de session sont confirmées à la signature, sous réserve de disponibilité.</li>
  <li>Le programme détaillé de la formation est annexé au présent devis.</li>
</ul>

<table style="width:100%;font-size:12px;margin-top:26px;">
  <tr>
    <td style="width:50%;vertical-align:top;">
      <div style="color:#71717a;">Pour l'organisme</div>
      <div style="margin-top:44px;border-top:1px solid #d4d4d8;padding-top:4px;">${esc(input.org.name)}</div>
    </td>
    <td style="width:50%;vertical-align:top;padding-left:24px;">
      <div style="color:#71717a;">Bon pour accord — date et signature</div>
      <div style="margin-top:44px;border-top:1px solid #d4d4d8;padding-top:4px;">
        ${esc(input.client.companyName || input.client.fullName)}
      </div>
    </td>
  </tr>
</table>`.trim();
}
