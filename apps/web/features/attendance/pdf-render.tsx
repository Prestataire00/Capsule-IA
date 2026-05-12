import 'server-only';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { createElement } from 'react';

export type PdfSignatureLine = {
  readonly participantKind: 'learner' | 'trainer';
  readonly fullName: string;
  readonly status: 'present' | 'absent' | 'late' | 'excused' | null;
  readonly signedAt: string | null;
  readonly signerIp: string | null;
  readonly signerCountry: string | null;
  readonly evidenceSource: 'manual' | 'qr' | 'zoom_csv' | 'zoom_api' | 'trainer_override';
  readonly signatureSignedUrl: string | null;
};

export type AttendancePdfInput = {
  readonly sheetId: string;
  readonly halfDay: 'morning' | 'afternoon' | 'full' | 'evening';
  readonly dossierReference: string;
  readonly formationTitle: string;
  readonly organizationName: string;
  readonly organizationLogoUrl: string | null;
  readonly sessionStartsAt: Date;
  readonly sessionEndsAt: Date;
  readonly modality: string;
  readonly location: string | null;
  readonly lines: readonly PdfSignatureLine[];
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: '#18181b' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#a1a1aa',
  },
  logo: { width: 80, height: 32, objectFit: 'contain' },
  title: { fontSize: 13, fontWeight: 'bold' },
  meta: { color: '#52525b', marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 6, color: '#52525b', marginTop: 1 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    borderTopWidth: 1,
    borderTopColor: '#a1a1aa',
    borderBottomWidth: 1,
    borderBottomColor: '#a1a1aa',
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
    paddingVertical: 6,
    minHeight: 42,
    alignItems: 'center',
  },
  cellName: { flex: 1.8, paddingHorizontal: 6 },
  cellStatus: { width: 56, paddingHorizontal: 6, fontSize: 8 },
  cellTime: { width: 80, paddingHorizontal: 6, fontFamily: 'Courier', fontSize: 8 },
  cellSig: { flex: 1.2, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  cellSource: { width: 64, paddingHorizontal: 6, fontSize: 7, color: '#71717a' },
  cellMeta: { width: 110, paddingHorizontal: 6, fontFamily: 'Courier', fontSize: 7, color: '#71717a' },
  sigImg: { width: 90, height: 28, objectFit: 'contain' },
  zoomBadge: {
    fontSize: 7,
    color: '#5b21b6',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
  footer: { marginTop: 24, fontSize: 7, color: '#71717a' },
  hash: { fontFamily: 'Courier', fontSize: 7, marginTop: 4, color: '#a1a1aa' },
});

const HALF_DAY_LABELS: Record<AttendancePdfInput['halfDay'], string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full: 'Journée',
  evening: 'Soir',
};

const STATUS_LABELS: Record<NonNullable<PdfSignatureLine['status']>, string> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'Retard',
  excused: 'Excusé',
};

const KIND_LABELS = { learner: 'Apprenant', trainer: 'Formateur' } as const;

const formatDateFr = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(d);

export const renderAttendancePdf = async (input: AttendancePdfInput): Promise<Buffer> => {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Feuille d&apos;émargement — {HALF_DAY_LABELS[input.halfDay]}
            </Text>
            <Text style={styles.meta}>
              {input.dossierReference} · {input.formationTitle}
            </Text>
            <View style={styles.metaRow}>
              <Text>
                {formatDateFr(input.sessionStartsAt)} → {formatDateFr(input.sessionEndsAt)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text>
                {input.modality} {input.location ? `· ${input.location}` : ''}
              </Text>
            </View>
          </View>
          {input.organizationLogoUrl ? (
            <Image src={input.organizationLogoUrl} style={styles.logo} />
          ) : (
            <Text style={{ ...styles.title, fontSize: 10 }}>{input.organizationName}</Text>
          )}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.cellName}>Participant</Text>
          <Text style={styles.cellStatus}>Statut</Text>
          <Text style={styles.cellTime}>Horodatage</Text>
          <Text style={styles.cellSig}>Signature / Preuve</Text>
          <Text style={styles.cellSource}>Source</Text>
          <Text style={styles.cellMeta}>IP · Pays</Text>
        </View>

        {input.lines.map((line, i) => {
          const isZoom = line.evidenceSource === 'zoom_csv' || line.evidenceSource === 'zoom_api';
          return (
            <View style={styles.tableRow} key={i}>
              <View style={styles.cellName}>
                <Text>{line.fullName}</Text>
                <Text style={{ fontSize: 7, color: '#71717a' }}>
                  {KIND_LABELS[line.participantKind]}
                </Text>
              </View>
              <Text style={styles.cellStatus}>
                {line.status ? STATUS_LABELS[line.status] : '—'}
              </Text>
              <Text style={styles.cellTime}>
                {line.signedAt
                  ? new Intl.DateTimeFormat('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(line.signedAt))
                  : '—'}
              </Text>
              <View style={styles.cellSig}>
                {line.signatureSignedUrl ? (
                  <Image src={line.signatureSignedUrl} style={styles.sigImg} />
                ) : isZoom ? (
                  <Text style={styles.zoomBadge}>Log Zoom</Text>
                ) : (
                  <Text style={{ color: '#a1a1aa' }}>—</Text>
                )}
              </View>
              <Text style={styles.cellSource}>{line.evidenceSource}</Text>
              <Text style={styles.cellMeta}>
                {line.signerIp ?? '—'}
                {line.signerCountry ? `\n${line.signerCountry}` : ''}
              </Text>
            </View>
          );
        })}

        <Text style={styles.footer}>
          {input.organizationName} · Document généré le {formatDateFr(new Date())} ·
          Conforme Qualiopi I-11
        </Text>
        <Text style={styles.hash}>Feuille ID : {input.sheetId}</Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
};

// renderAttendancePdf renvoie déjà un Buffer Node prêt pour upload Supabase.
// Re-export typé pour les call sites.
export type AttendancePdfBuffer = Buffer;
void createElement;
