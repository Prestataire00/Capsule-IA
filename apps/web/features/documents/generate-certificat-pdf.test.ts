import { describe, it, expect } from 'vitest';
import { generateCertificatPDF, type CertificatInput } from './generate-certificat-pdf';

const baseInput: CertificatInput = {
  organization: {
    name: 'Organisme Test',
    siret: '12345678901234',
    nda: '11756789012',
    address: '1 rue de la Formation, 75001 Paris',
    representativeName: 'Marie Dupont',
  },
  signaturePng: null,
  stampPng: null,
  representativeTitle: 'Gérante',
  place: 'Paris',
  learner: {
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice.martin@example.com',
    birthDate: '1990-05-12',
  },
  formation: { title: 'Comptabilité avancée' },
  dossier: {
    reference: 'D-2026-001',
    startDate: '2026-01-10',
    endDate: '2026-02-20',
    plannedHours: 70,
    deliveredHours: 63,
    modality: 'presentiel',
    attendanceRate: 90,
  },
  generatedAt: new Date('2026-02-21T10:00:00Z'),
};

const pdfHeader = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe('generateCertificatPDF', () => {
  it('produit un PDF non vide (%PDF)', async () => {
    const bytes = await generateCertificatPDF(baseInput);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdfHeader(bytes)).toBe('%PDF-');
  });

  it('fonctionne sans branding (signature/cachet absents) et durées égales', async () => {
    const bytes = await generateCertificatPDF({
      ...baseInput,
      organization: { ...baseInput.organization, representativeName: null },
      dossier: { ...baseInput.dossier, plannedHours: 70, deliveredHours: 70 },
    });
    expect(pdfHeader(bytes)).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
