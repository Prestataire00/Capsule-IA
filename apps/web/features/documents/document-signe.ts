import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Le document tel que signé : le PDF d'origine, suivi d'une page « Certificat
 * de signature électronique » par document — chaque signataire, l'horodatage,
 * l'adresse IP, le navigateur, l'empreinte du document et l'image de sa
 * signature. Construit à la demande depuis la copie archivée et les
 * signatures enregistrées : rien n'est dupliqué en stockage.
 */

export type SignatureEnregistree = {
  nom: string | null;
  email: string | null;
  signeLe: string;
  ip: string | null;
  navigateur: string | null;
  empreinte: string | null;
  imagePath: string | null;
};

const A4: [number, number] = [595.28, 841.89];
const MARGE = 50;
const TEXTE = rgb(0.094, 0.094, 0.106);
const DISCRET = rgb(0.42, 0.42, 0.45);
const ACCENT = rgb(0.976, 0.451, 0.086);

const dateParis = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(iso));

/** Helvetica standard ne code que WinAnsi : on remplace ce qu'elle ne sait pas écrire. */
function lisible(font: PDFFont, texte: string): string {
  const t = texte
    .replace(/[‘’]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ');
  let sortie = '';
  for (const c of t) {
    try {
      font.encodeText(c);
      sortie += c;
    } catch {
      sortie += '?';
    }
  }
  return sortie;
}

export async function signaturesDuDocument(sb: SupabaseClient, documentId: string): Promise<SignatureEnregistree[]> {
  const { data } = await sb
    .schema('app')
    .from('document_signatures')
    .select('signer_name, signer_email, signed_at, signer_ip, signer_user_agent, document_hash_at_signature, signature_image_path')
    .eq('document_id', documentId)
    .eq('status', 'signed')
    .order('signed_at', { ascending: true });
  return ((data ?? []) as Array<{
    signer_name: string | null;
    signer_email: string | null;
    signed_at: string | null;
    signer_ip: string | null;
    signer_user_agent: string | null;
    document_hash_at_signature: string | null;
    signature_image_path: string | null;
  }>)
    .filter((s) => s.signed_at)
    .map((s) => ({
      nom: s.signer_name,
      email: s.signer_email,
      signeLe: s.signed_at as string,
      ip: s.signer_ip,
      navigateur: s.signer_user_agent,
      empreinte: s.document_hash_at_signature,
      imagePath: s.signature_image_path,
    }));
}

async function lireImage(sb: SupabaseClient, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from('signatures').download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Le PDF signé, ou `null` si le document n'a pas de PDF archivé. */
export async function construirePdfSigne(
  sb: SupabaseClient,
  doc: { id: string; title: string | null; storage_path: string | null },
  signatures: SignatureEnregistree[],
): Promise<Uint8Array | null> {
  if (!doc.storage_path) return null;
  const { data: fichier, error } = await sb.storage.from('documents').download(doc.storage_path);
  if (error || !fichier) return null;

  const pdf = await PDFDocument.load(new Uint8Array(await fichier.arrayBuffer()), { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  let y = A4[1] - MARGE;
  const ecrire = (texte: string, opts: { taille?: number; police?: PDFFont; couleur?: ReturnType<typeof rgb> } = {}) => {
    const taille = opts.taille ?? 10;
    const police = opts.police ?? font;
    // Coupe les lignes trop longues (navigateur, empreinte) à la largeur utile.
    const largeur = A4[0] - 2 * MARGE;
    let reste = lisible(police, texte);
    while (reste.length) {
      let n = reste.length;
      while (n > 1 && police.widthOfTextAtSize(reste.slice(0, n), taille) > largeur) n -= 1;
      page.drawText(reste.slice(0, n), { x: MARGE, y, size: taille, font: police, color: opts.couleur ?? TEXTE });
      y -= taille + 4;
      reste = reste.slice(n);
    }
  };

  page.drawRectangle({ x: MARGE, y: y - 2, width: 40, height: 3, color: ACCENT });
  y -= 22;
  ecrire('Certificat de signature électronique', { taille: 16, police: gras });
  y -= 4;
  ecrire(`Document : ${doc.title ?? 'Document'}`, { police: gras });
  ecrire(`Référence interne : ${doc.id}`, { taille: 9, couleur: DISCRET });
  ecrire(
    'Les signatures ci-dessous ont été recueillies en ligne, sur un lien personnel envoyé par e-mail à chaque signataire. ' +
      'Les pages précédentes sont le document présenté à la signature.',
    { taille: 9, couleur: DISCRET },
  );
  y -= 10;

  for (const s of signatures) {
    const image = await lireImage(sb, s.imagePath);
    const hauteurBloc = 150;
    if (y - hauteurBloc < MARGE) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGE;
    }
    page.drawLine({ start: { x: MARGE, y: y + 6 }, end: { x: A4[0] - MARGE, y: y + 6 }, thickness: 0.5, color: DISCRET });
    y -= 10;
    ecrire(s.nom ?? s.email ?? 'Signataire', { taille: 12, police: gras });
    if (s.email) ecrire(s.email);
    ecrire(`Signé le ${dateParis(s.signeLe)} (heure de Paris)`);
    if (s.ip) ecrire(`Adresse IP : ${s.ip}`, { taille: 9, couleur: DISCRET });
    if (s.navigateur) ecrire(`Navigateur : ${s.navigateur}`, { taille: 8, couleur: DISCRET });
    if (s.empreinte) ecrire(`Empreinte du document signé (SHA-256) : ${s.empreinte}`, { taille: 8, couleur: DISCRET });
    if (image) {
      try {
        const png = await pdf.embedPng(image);
        const echelle = Math.min(200 / png.width, 70 / png.height, 1);
        const l = png.width * echelle;
        const h = png.height * echelle;
        y -= h + 4;
        page.drawImage(png, { x: MARGE, y, width: l, height: h });
        y -= 8;
      } catch {
        ecrire('(image de signature illisible)', { taille: 9, couleur: DISCRET });
      }
    }
    y -= 12;
  }

  return pdf.save();
}
