import 'server-only';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

/**
 * Feuille d'émargement papier, de secours (panne de réseau, appareil
 * indisponible) : noms pré-remplis, cases d'entrée et de sortie à signer,
 * signature du formateur. L'équipe reporte ensuite les présences dans la
 * grille (mode « feuille papier ») et conserve l'original.
 */

export type PaperSheetInput = {
  readonly organizationName: string;
  readonly formationTitle: string;
  /** Feuille d'une entreprise cliente : son nom en tête, ses salariés seulement. */
  readonly companyName?: string | null;
  readonly slotLabel: string;
  readonly learners: readonly string[];
  readonly trainers: readonly string[];
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica', color: '#18181b' },
  title: { fontSize: 14, marginBottom: 2 },
  meta: { color: '#52525b', marginBottom: 12 },
  head: { flexDirection: 'row', backgroundColor: '#f4f4f5', borderWidth: 1, borderColor: '#a1a1aa', paddingVertical: 4, fontSize: 8 },
  row: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#a1a1aa', height: 38 },
  name: { flex: 1.4, paddingHorizontal: 5, justifyContent: 'center' },
  cell: { flex: 1, borderLeftWidth: 1, borderColor: '#a1a1aa', paddingHorizontal: 4, paddingTop: 3 },
  small: { fontSize: 6.5, color: '#71717a' },
  section: { marginTop: 16, marginBottom: 4, fontSize: 10 },
  footer: { marginTop: 14, fontSize: 7, color: '#71717a' },
});

function Ligne({ nom, sortie }: { nom: string; sortie: boolean }) {
  return (
    <View style={styles.row} wrap={false}>
      <View style={styles.name}>
        <Text>{nom}</Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.small}>Heure :</Text>
      </View>
      {sortie && (
        <View style={styles.cell}>
          <Text style={styles.small}>Heure :</Text>
        </View>
      )}
      <View style={styles.cell}>
        <Text style={styles.small}>Observations</Text>
      </View>
    </View>
  );
}

export async function renderPaperSheet(input: PaperSheetInput): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Feuille d’émargement</Text>
        <Text style={styles.meta}>
          {input.organizationName} · {input.formationTitle} · {input.slotLabel}
          {input.companyName ? ` · Société : ${input.companyName}` : ''}
        </Text>

        <View style={styles.head}>
          <Text style={styles.name}>Apprenant</Text>
          <Text style={styles.cell}>Entrée — signature</Text>
          <Text style={styles.cell}>Sortie — signature</Text>
          <Text style={styles.cell}>Observations</Text>
        </View>
        {input.learners.map((n, i) => (
          <Ligne key={`a${i}`} nom={n} sortie />
        ))}

        <Text style={styles.section}>Formateur</Text>
        <View style={styles.head}>
          <Text style={styles.name}>Formateur</Text>
          <Text style={styles.cell}>Signature</Text>
          <Text style={styles.cell}>Observations</Text>
        </View>
        {(input.trainers.length ? input.trainers : ['']).map((n, i) => (
          <Ligne key={`f${i}`} nom={n} sortie={false} />
        ))}

        <Text style={styles.footer}>
          Feuille de secours : reportez les présences dans Capsule (mode « feuille papier ») et conservez l’original signé avec le dossier.
        </Text>
      </Page>
    </Document>
  );
  return await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}
