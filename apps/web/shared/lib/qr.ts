import QRCode from 'qrcode';

// Helper QR partagé (PNG). Pur et testable (pas de `server-only`).
export async function renderQrPng(text: string, opts?: { width?: number }): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: opts?.width ?? 320,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

// Même QR en image intégrable (`data:` URL), pour un affichage qui se renouvelle.
export async function renderQrDataUrl(text: string, opts?: { width?: number }): Promise<string> {
  return QRCode.toDataURL(text, {
    width: opts?.width ?? 320,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}
