// Mentions rendues obligatoires par la réforme de la facturation électronique
// (loi de finances 2024 art. 91 ; réception au 1er sept. 2026, émission des PME
// au 1er sept. 2027) : SIREN du client, nature de l'opération, et option pour
// le paiement de la TVA d'après les débits quand l'organisme l'a prise.
//
// Au passage, un garde-fou sur un bug trouvé en écrivant ces tests : une
// facture d'au moins 1 000 € ne se générait pas du tout.
import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateInvoicePDF, type InvoiceInput } from '@/features/documents/generate-invoice-pdf';

/** pdf-lib écrit le texte tracé en chaînes hexadécimales, dans des flux compressés. */
const decodeHex = (flux: string): string =>
  flux.replace(/<([0-9A-Fa-f]{2,})>/g, (tout, hex: string) =>
    hex.length % 2 === 0 ? Buffer.from(hex, 'hex').toString('latin1') : tout,
  );

const texteDuPdf = (bytes: Uint8Array): string => {
  const brut = Buffer.from(bytes);
  let sortie = brut.toString('latin1');
  let i = 0;
  for (;;) {
    const mot = brut.indexOf('stream', i);
    if (mot < 0) break;
    const fin = brut.indexOf('endstream', mot + 6);
    if (fin < 0) break;
    let debut = mot + 'stream'.length;
    while (brut[debut] === 0x0d || brut[debut] === 0x0a) debut += 1;
    try {
      sortie += decodeHex(inflateSync(brut.subarray(debut, fin)).toString('latin1'));
    } catch {
      // Flux non compressé : rien à en tirer.
    }
    i = fin + 'endstream'.length;
  }
  return sortie;
};

const base: InvoiceInput = {
  organization: {
    name: 'CAPSULE IA',
    siret: '98953111600014',
    nda: '11756789012',
    vatOnDebits: false,
    address: '25 rue Romain Rolland, 45100 Orléans',
    contactEmail: 'contact@capsule-ia.fr',
    contactPhone: '06 12 34 56 78',
  },
  recipient: { name: 'OPCO ATLAS', siret: '11002001300019', address: '25 quai Panhard, 75013 Paris' },
  signaturePng: null,
  stampPng: null,
  logoPng: null,
  representativeName: 'Ismael Le Pennec',
  representativeTitle: 'Gérant',
  place: 'Orléans',
  invoice: {
    reference: 'FAC-2026-0042',
    issuedAt: '2026-09-19',
    dueAt: '2026-10-19',
    status: 'issued',
    subtotalCents: 144000,
    vatCents: 0,
    totalCents: 144000,
    currency: 'EUR',
    paymentTerms: 'Paiement à 30 jours',
    dossierReference: 'DOS-2026-5B372565',
  },
  lines: [{ description: 'Formation — 5 h', quantity: 1, unitAmountCents: 144000, vatRate: 0 }],
  generatedAt: new Date('2026-09-19T09:00:00Z'),
};

describe('mentions de la facture électronique', () => {
  it('porte le SIREN du client, pivot du rapprochement fiscal', async () => {
    const pdf = texteDuPdf(await generateInvoicePDF(base));
    expect(pdf).toContain('SIREN 110 020 013');
    expect(pdf).toContain('SIRET 110 020 013 00019');
  });

  it('annonce la nature de l’opération', async () => {
    const pdf = texteDuPdf(await generateInvoicePDF(base));
    expect(pdf).toContain('prestation de services');
  });

  it('ne mentionne les débits que si l’organisme a opté', async () => {
    const sans = texteDuPdf(await generateInvoicePDF(base));
    expect(sans).not.toContain('apr');

    const avec = texteDuPdf(
      await generateInvoicePDF({ ...base, organization: { ...base.organization, vatOnDebits: true } }),
    );
    expect(avec).toContain('Option pour le paiement de la taxe d');
  });

  it('se passe du SIREN quand le client n’en a pas (particulier)', async () => {
    const pdf = texteDuPdf(await generateInvoicePDF({ ...base, recipient: { ...base.recipient, siret: null } }));
    expect(pdf).not.toContain('SIREN');
    expect(pdf).toContain('prestation de services');
  });
});

describe('montants à quatre chiffres', () => {
  // `Intl.NumberFormat('fr-FR')` sépare les milliers par une espace fine
  // insécable (U+202F) que WinAnsi n'encode pas : `drawText` levait, et AUCUNE
  // facture d'au moins 1 000 € ne se générait.
  it('génère une facture de plus de mille euros', async () => {
    const bytes = await generateInvoicePDF(base);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(texteDuPdf(bytes)).toContain('1 440,00');
  });

  it('en génère une à six chiffres', async () => {
    const gros = {
      ...base,
      invoice: { ...base.invoice, subtotalCents: 12345600, totalCents: 12345600 },
      lines: [{ description: 'Parcours annuel', quantity: 1, unitAmountCents: 12345600, vatRate: 0 }],
    };
    await expect(generateInvoicePDF(gros)).resolves.toBeDefined();
  });
});

describe('le financeur porte enfin un identifiant', () => {
  const SOURCE = fs.readFileSync(
    path.resolve(__dirname, '../features/billing/invoices/invoice-pdf.ts'),
    'utf-8',
  );

  it('le SIRET du financeur est lu et remonté, au lieu d’un null en dur', () => {
    expect(SOURCE).toContain("select('name, siret, contact_email, address')");
    expect(SOURCE).not.toContain('siret: null, address: composeAddress(f.address)');
  });

  it('l’organisme ne signe plus ses factures avec son adresse de contact', () => {
    expect(SOURCE).not.toContain('branding.representativeName ?? org?.contact_email');
  });
});
