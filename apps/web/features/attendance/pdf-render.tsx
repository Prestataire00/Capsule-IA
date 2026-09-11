import 'server-only';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { rgpdMention } from '@/features/documents/legal/requirements';

/**
 * Feuille d'émargement clôturée, en PDF : une ligne par participant attendu —
 * y compris absents et excusés —, avec l'entrée et la sortie (heure et
 * signature), le retard, le départ anticipé, le motif d'absence, et la façon
 * dont la présence a été recueillie. Le formateur figure en tête.
 */

export type PdfSignatureLine = {
  readonly participantKind: 'learner' | 'trainer';
  readonly fullName: string;
  readonly status: 'present' | 'absent' | 'late' | 'excused' | null;
  readonly signedAt: string | null;
  readonly signerIp: string | null;
  readonly signerCountry: string | null;
  readonly evidenceSource: 'manual' | 'qr' | 'zoom_csv' | 'zoom_api' | 'trainer_override';
  readonly signatureSignedUrl: string | null;
  readonly exitAt?: string | null;
  readonly exitSignatureUrl?: string | null;
  readonly exitAttested?: boolean;
  readonly lateArrival?: string | null;
  readonly earlyDeparture?: string | null;
  readonly absenceReason?: string | null;
  readonly captureMode?: string | null;
};

export type AttendancePdfInput = {
  readonly sheetId: string;
  readonly halfDay: 'morning' | 'afternoon' | 'full' | 'evening';
  readonly dossierReference: string;
  readonly formationTitle: string;
  readonly organizationName: string;
  /** Bloc d'identité de l'organisme (adresse, contact, SIRET · NDA · agréments). */
  readonly organizationLines?: readonly string[];
  readonly organizationLogoUrl: string | null;
  readonly sessionStartsAt: Date;
  readonly sessionEndsAt: Date;
  readonly modality: string;
  readonly location: string | null;
  readonly lines: readonly PdfSignatureLine[];
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: 'Helvetica', color: '#18181b' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#a1a1aa',
  },
  logo: { width: 80, height: 32, objectFit: 'contain' },
  title: { fontSize: 13 },
  meta: { color: '#52525b', marginTop: 2 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    borderTopWidth: 1,
    borderTopColor: '#a1a1aa',
    borderBottomWidth: 1,
    borderBottomColor: '#a1a1aa',
    paddingVertical: 4,
    fontSize: 7.5,
  },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e4e4e7', paddingVertical: 5, minHeight: 40, alignItems: 'center' },
  cName: { flex: 1.3, paddingHorizontal: 5 },
  cStatus: { width: 58, paddingHorizontal: 5 },
  cSig: { flex: 1, paddingHorizontal: 5, alignItems: 'center' },
  cNotes: { flex: 1.1, paddingHorizontal: 5, fontSize: 7.5, color: '#3f3f46' },
  sigImg: { width: 76, height: 24, objectFit: 'contain' },
  time: { fontFamily: 'Courier', fontSize: 7.5 },
  muted: { color: '#a1a1aa' },
  summary: { marginTop: 12, fontSize: 8, color: '#3f3f46' },
  footer: { marginTop: 10, fontSize: 7, color: '#71717a' },
  hash: { fontFamily: 'Courier', fontSize: 6.5, marginTop: 3, color: '#a1a1aa' },
});

const HALF_DAY: Record<AttendancePdfInput['halfDay'], string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const STATUS: Record<NonNullable<PdfSignatureLine['status']>, string> = { present: 'Présent', absent: 'Absent', late: 'En retard', excused: 'Absent excusé' };
const MODE: Record<string, string> = {
  lien: 'Lien personnel',
  lien_equipe: 'Lien remis par l’équipe',
  papier: 'Feuille papier',
  qr: 'QR code projeté en salle',
  tablette: 'Tablette de l’organisme',
  visio: 'Confirmation visio',
  grille: 'Attestée par l’équipe',
  zoom: 'Journal Zoom',
};
const SOURCE: Record<PdfSignatureLine['evidenceSource'], string> = {
  qr: 'Lien personnel',
  manual: 'Tablette de l’organisme',
  trainer_override: 'Attestée par l’équipe',
  zoom_csv: 'Journal Zoom',
  zoom_api: 'Journal Zoom',
};

const PARIS = 'Europe/Paris';
const dateLongue = (d: Date) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: PARIS }).format(d);
const heure = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(new Date(iso)) : null;

function Cellule({ at, url }: { at: string | null | undefined; url: string | null | undefined }) {
  return (
    <View style={styles.cSig}>
      {url ? <Image src={url} style={styles.sigImg} /> : null}
      <Text style={at ? styles.time : styles.muted}>{heure(at) ?? '—'}</Text>
    </View>
  );
}

export const renderAttendancePdf = async (input: AttendancePdfInput): Promise<Buffer> => {
  const apprenants = input.lines.filter((l) => l.participantKind === 'learner');
  const presents = apprenants.filter((l) => l.status === 'present' || l.status === 'late').length;
  const absents = apprenants.filter((l) => l.status === 'absent').length;
  const excuses = apprenants.filter((l) => l.status === 'excused').length;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Feuille d’émargement — {HALF_DAY[input.halfDay]}</Text>
            <Text style={styles.meta}>
              {input.dossierReference} · {input.formationTitle}
            </Text>
            <Text style={styles.meta}>
              {dateLongue(input.sessionStartsAt)} → {heure(input.sessionEndsAt.toISOString())} (horaires de la demi-journée)
            </Text>
            <Text style={styles.meta}>
              {input.modality}
              {input.location ? ` · ${input.location}` : ''}
            </Text>
          </View>
          {input.organizationLogoUrl ? (
            <Image src={input.organizationLogoUrl} style={styles.logo} />
          ) : (
            <View>
              <Text style={{ fontSize: 10 }}>{input.organizationName}</Text>
              {(input.organizationLines ?? []).map((l, i) => (
                <Text key={i} style={{ fontSize: 6.5, color: '#71717a', textAlign: 'right' }}>
                  {l}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.cName}>Participant</Text>
          <Text style={styles.cStatus}>Statut</Text>
          <Text style={styles.cSig}>Entrée</Text>
          <Text style={styles.cSig}>Sortie</Text>
          <Text style={styles.cNotes}>Remarques</Text>
        </View>

        {input.lines.map((l, i) => {
          const remarques = [
            l.lateArrival ? `Arrivée ${l.lateArrival}` : null,
            l.earlyDeparture ? `Départ ${l.earlyDeparture}` : null,
            l.absenceReason ? `Motif : ${l.absenceReason}` : null,
            l.exitAttested ? 'Sortie attestée par l’équipe' : null,
            l.captureMode ? MODE[l.captureMode] ?? l.captureMode : l.signedAt ? SOURCE[l.evidenceSource] : null,
          ].filter(Boolean);
          return (
            <View style={styles.row} key={i} wrap={false}>
              <View style={styles.cName}>
                <Text>{l.fullName}</Text>
                <Text style={{ fontSize: 7, color: '#71717a' }}>{l.participantKind === 'trainer' ? 'Formateur' : 'Apprenant'}</Text>
              </View>
              <Text style={styles.cStatus}>{l.status ? STATUS[l.status] : '—'}</Text>
              <Cellule at={l.signedAt} url={l.signatureSignedUrl} />
              {l.participantKind === 'trainer' ? <View style={styles.cSig} /> : <Cellule at={l.exitAt} url={l.exitSignatureUrl} />}
              <Text style={styles.cNotes}>{remarques.join('\n') || '—'}</Text>
            </View>
          );
        })}

        <Text style={styles.summary}>
          {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''} attendu{apprenants.length > 1 ? 's' : ''} · {presents} présent
          {presents > 1 ? 's' : ''} · {absents} absent{absents > 1 ? 's' : ''} · {excuses} excusé{excuses > 1 ? 's' : ''}
        </Text>
        <Text style={styles.footer}>
          {input.organizationName} · Feuille clôturée le {dateLongue(new Date())} · Signatures horodatées, rattachées à l’appareil du
          signataire, conservées par l’organisme · Preuve de présence par demi-journée
        </Text>
        <Text style={styles.footer}>{rgpdMention(null)}</Text>
        <Text style={styles.hash}>Feuille : {input.sheetId}</Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
};

export type AttendancePdfBuffer = Buffer;
