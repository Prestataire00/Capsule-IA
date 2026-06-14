import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type ProgrammeInput = {
  organization: {
    name: string;
    siret: string | null;
    nda: string | null;
    address: string | null;
  };
  formation: {
    title: string;
    objectives: string[];
    pedagogicalMethod: string | null;
    evaluationMethod: string | null;
    targetAudience: string | null;
    prerequisites: string[];
  };
  dossier: {
    reference: string;
    startDate: string;
    endDate: string;
    totalHours: number;
    modality: string;
    totalAmountCents: number | null;
    currency: string;
    accessibilityNotes: string | null;
  };
  modules: Array<{
    position: number;
    title: string;
    durationHours: number;
    startDate: string | null;
    endDate: string | null;
  }>;
  sessions: Array<{
    startsAt: string;
    endsAt: string;
    location: string | null;
    remoteUrl: string | null;
  }>;
  generatedAt: Date;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const COL = A4.width - MARGIN * 2;
const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);
const COLOR_RULE = rgb(0.89, 0.89, 0.91);
const COLOR_ACCENT = rgb(0.486, 0.227, 0.929);

type Cursor = { page: PDFPage; y: number };

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
};

const fmtEuros = (cents: number | null, currency: string): string => {
  if (cents == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
};

const modalityLabel = (m: string): string =>
  ({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride', afest: 'AFEST' } as Record<string, string>)[m] ?? m;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function ensureRoom(doc: PDFDocument, c: Cursor, neededHeight: number): Cursor {
  if (c.y - neededHeight < MARGIN) {
    const page = doc.addPage([A4.width, A4.height]);
    return { page, y: A4.height - MARGIN };
  }
  return c;
}

function drawLabel(c: Cursor, font: PDFFont, label: string): Cursor {
  c.page.drawText(label.toUpperCase(), {
    x: MARGIN,
    y: c.y,
    size: 8,
    font,
    color: COLOR_MUTED,
  });
  return { ...c, y: c.y - 12 };
}

function drawHeading(doc: PDFDocument, c: Cursor, fontBold: PDFFont, text: string): Cursor {
  const out = ensureRoom(doc, c, 30);
  out.page.drawText(text, { x: MARGIN, y: out.y, size: 13, font: fontBold, color: COLOR_BODY });
  out.page.drawLine({
    start: { x: MARGIN, y: out.y - 6 },
    end: { x: MARGIN + COL, y: out.y - 6 },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  return { ...out, y: out.y - 18 };
}

function drawText(doc: PDFDocument, c: Cursor, font: PDFFont, text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}): Cursor {
  const size = opts.size ?? 10;
  const maxWidth = opts.maxWidth ?? COL;
  const color = opts.color ?? COLOR_BODY;
  const lines = wrapText(text, font, size, maxWidth);
  let cursor = ensureRoom(doc, c, lines.length * (size + 4));
  for (const line of lines) {
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size, font, color });
    cursor = { ...cursor, y: cursor.y - (size + 4) };
  }
  return cursor;
}

function drawKeyValue(doc: PDFDocument, c: Cursor, font: PDFFont, fontBold: PDFFont, key: string, value: string): Cursor {
  const cursor = ensureRoom(doc, c, 16);
  cursor.page.drawText(key, { x: MARGIN, y: cursor.y, size: 9, font, color: COLOR_MUTED });
  const lines = wrapText(value, fontBold, 10, COL - 140);
  cursor.page.drawText(lines[0] ?? '—', { x: MARGIN + 140, y: cursor.y, size: 10, font: fontBold, color: COLOR_BODY });
  let y = cursor.y - 14;
  for (let i = 1; i < lines.length; i++) {
    const c2 = ensureRoom(doc, { page: cursor.page, y }, 14);
    c2.page.drawText(lines[i] ?? '', { x: MARGIN + 140, y: c2.y, size: 10, font: fontBold, color: COLOR_BODY });
    y = c2.y - 14;
  }
  return { page: cursor.page, y };
}

export async function generateProgrammePDF(input: ProgrammeInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let c: Cursor = { page, y: A4.height - MARGIN };

  // Header
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: 32, height: 4, color: COLOR_ACCENT });
  c = { ...c, y: c.y - 24 };
  c.page.drawText('PROGRAMME DE FORMATION', {
    x: MARGIN, y: c.y, size: 14, font: fontBold, color: COLOR_BODY,
  });
  c = { ...c, y: c.y - 18 };
  c.page.drawText(`Référence : ${input.dossier.reference}`, {
    x: MARGIN, y: c.y, size: 9, font, color: COLOR_BODY,
  });
  c.page.drawText(`Généré le ${fmtDate(input.generatedAt.toISOString())}`, {
    x: MARGIN + COL - 150, y: c.y, size: 9, font, color: COLOR_MUTED,
  });
  c = { ...c, y: c.y - 24 };

  // Section 1 — Organisme de formation
  c = drawHeading(doc, c, fontBold, '1. Organisme de formation');
  c = drawKeyValue(doc, c, font, fontBold, 'Raison sociale', input.organization.name);
  if (input.organization.siret) c = drawKeyValue(doc, c, font, fontBold, 'SIRET', input.organization.siret);
  if (input.organization.nda) c = drawKeyValue(doc, c, font, fontBold, 'N° déclaration activité', input.organization.nda);
  if (input.organization.address) c = drawKeyValue(doc, c, font, fontBold, 'Adresse', input.organization.address);
  c = { ...c, y: c.y - 12 };

  // Section 2 — Formation
  c = drawHeading(doc, c, fontBold, '2. Présentation de la formation');
  c = drawKeyValue(doc, c, font, fontBold, 'Intitulé', input.formation.title);
  c = drawKeyValue(doc, c, font, fontBold, 'Période', `du ${fmtDate(input.dossier.startDate)} au ${fmtDate(input.dossier.endDate)}`);
  c = drawKeyValue(doc, c, font, fontBold, 'Durée totale', `${input.dossier.totalHours} heures`);
  c = drawKeyValue(doc, c, font, fontBold, 'Modalité', modalityLabel(input.dossier.modality));
  c = drawKeyValue(doc, c, font, fontBold, 'Tarif', fmtEuros(input.dossier.totalAmountCents, input.dossier.currency));
  c = { ...c, y: c.y - 8 };

  if (input.formation.objectives.length > 0) {
    c = drawLabel(c, font, 'Objectifs pédagogiques');
    for (const obj of input.formation.objectives) {
      c = drawText(doc, c, font, `• ${obj}`, { size: 10 });
    }
    c = { ...c, y: c.y - 4 };
  } else {
    c = drawLabel(c, font, 'Objectifs pédagogiques');
    c = drawText(doc, c, font, '—');
    c = { ...c, y: c.y - 4 };
  }

  if (input.formation.targetAudience) {
    c = drawLabel(c, font, 'Public cible');
    c = drawText(doc, c, font, input.formation.targetAudience);
    c = { ...c, y: c.y - 4 };
  }

  if (input.formation.prerequisites.length > 0) {
    c = drawLabel(c, font, 'Prérequis');
    for (const p of input.formation.prerequisites) {
      c = drawText(doc, c, font, `• ${p}`, { size: 10 });
    }
    c = { ...c, y: c.y - 4 };
  }

  if (input.formation.pedagogicalMethod) {
    c = drawLabel(c, font, 'Méthodes pédagogiques');
    c = drawText(doc, c, font, input.formation.pedagogicalMethod);
    c = { ...c, y: c.y - 4 };
  }

  if (input.formation.evaluationMethod) {
    c = drawLabel(c, font, "Modalités d'évaluation");
    c = drawText(doc, c, font, input.formation.evaluationMethod);
    c = { ...c, y: c.y - 4 };
  }

  c = { ...c, y: c.y - 8 };

  // Section 3 — Modules
  c = drawHeading(doc, c, fontBold, '3. Contenu et modules');
  if (input.modules.length === 0) {
    c = drawText(doc, c, font, '—', { color: COLOR_MUTED });
  } else {
    for (const mod of input.modules) {
      const moduleNeeded = 28;
      c = ensureRoom(doc, c, moduleNeeded);

      // Module number badge
      const badgeText = `${mod.position + 1}`;
      const badgeW = 18;
      c.page.drawRectangle({ x: MARGIN, y: c.y - 14, width: badgeW, height: 16, color: COLOR_ACCENT });
      c.page.drawText(badgeText, {
        x: MARGIN + (badgeW - fontBold.widthOfTextAtSize(badgeText, 8)) / 2,
        y: c.y - 10,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      // Module title
      const titleLines = wrapText(mod.title, fontBold, 10, COL - badgeW - 8 - 80);
      c.page.drawText(titleLines[0] ?? mod.title, {
        x: MARGIN + badgeW + 8,
        y: c.y,
        size: 10,
        font: fontBold,
        color: COLOR_BODY,
      });

      // Duration (right-aligned)
      const durText = `${mod.durationHours} h`;
      c.page.drawText(durText, {
        x: MARGIN + COL - fontBold.widthOfTextAtSize(durText, 9),
        y: c.y,
        size: 9,
        font: fontBold,
        color: COLOR_BODY,
      });

      c = { ...c, y: c.y - 14 };

      // Overflow title lines
      for (let i = 1; i < titleLines.length; i++) {
        c = ensureRoom(doc, c, 14);
        c.page.drawText(titleLines[i] ?? '', {
          x: MARGIN + badgeW + 8,
          y: c.y,
          size: 10,
          font: fontBold,
          color: COLOR_BODY,
        });
        c = { ...c, y: c.y - 14 };
      }

      // Module dates (optional)
      if (mod.startDate && mod.endDate) {
        c = ensureRoom(doc, c, 14);
        const dateText = `du ${fmtDate(mod.startDate)} au ${fmtDate(mod.endDate)}`;
        c.page.drawText(dateText, {
          x: MARGIN + badgeW + 8,
          y: c.y,
          size: 8,
          font,
          color: COLOR_MUTED,
        });
        c = { ...c, y: c.y - 12 };
      } else {
        c = { ...c, y: c.y - 2 };
      }
    }
  }
  c = { ...c, y: c.y - 12 };

  // Section 4 — Calendrier des sessions
  c = drawHeading(doc, c, fontBold, '4. Calendrier des sessions');
  if (input.sessions.length === 0) {
    c = drawText(doc, c, font, '—', { color: COLOR_MUTED });
  } else {
    for (const session of input.sessions) {
      c = ensureRoom(doc, c, 36);

      const dateStr = fmtDate(session.startsAt);
      const timeStr = `${fmtTime(session.startsAt)} – ${fmtTime(session.endsAt)}`;

      // Date (bold)
      c.page.drawText(dateStr, {
        x: MARGIN,
        y: c.y,
        size: 10,
        font: fontBold,
        color: COLOR_BODY,
      });
      // Time range
      c.page.drawText(timeStr, {
        x: MARGIN + 140,
        y: c.y,
        size: 10,
        font,
        color: COLOR_BODY,
      });
      c = { ...c, y: c.y - 14 };

      // Location / remote
      const remoteUrl = session.remoteUrl;
      if (remoteUrl) {
        const distancielLines = wrapText(`Distanciel — ${remoteUrl}`, font, 9, COL);
        for (const line of distancielLines) {
          c = ensureRoom(doc, c, 12);
          c.page.drawText(line, {
            x: MARGIN,
            y: c.y,
            size: 9,
            font,
            color: COLOR_MUTED,
          });
          c = { ...c, y: c.y - 12 };
        }
      } else if (session.location) {
        const locLines = wrapText(session.location, font, 9, COL);
        for (const line of locLines) {
          c = ensureRoom(doc, c, 12);
          c.page.drawText(line, {
            x: MARGIN,
            y: c.y,
            size: 9,
            font,
            color: COLOR_MUTED,
          });
          c = { ...c, y: c.y - 12 };
        }
      } else {
        c.page.drawText('—', { x: MARGIN, y: c.y, size: 9, font, color: COLOR_MUTED });
        c = { ...c, y: c.y - 12 };
      }

      c = { ...c, y: c.y - 4 };
    }
  }
  c = { ...c, y: c.y - 8 };

  // Section 5 — Accessibilité
  c = drawHeading(doc, c, fontBold, '5. Accessibilité (Qualiopi indicateur 26)');
  c = drawText(
    doc, c, font,
    input.dossier.accessibilityNotes
      ?? "L'organisme s'engage à étudier toute demande d'aménagement liée à une situation de handicap. Contactez la référente handicap pour toute adaptation nécessaire.",
    { size: 10 },
  );

  // Footer on all pages
  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`Page ${idx + 1} / ${pages.length}  ·  ${input.organization.name}  ·  ${input.dossier.reference}`, {
      x: MARGIN, y: 24, size: 7, font, color: COLOR_MUTED,
    });
  });

  return doc.save();
}
