import 'server-only';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

/**
 * Planche de QR personnels à imprimer et à distribuer en salle : chaque carte
 * porte le nom de l'apprenant, la demi-journée et son QR (son lien personnel,
 * valable pour l'entrée puis la sortie).
 */

export type QrCard = {
  readonly name: string;
  readonly formationTitle: string;
  readonly slotLabel: string;
  readonly qrDataUrl: string;
};

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica', color: '#18181b' },
  title: { fontSize: 12, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '48.5%',
    height: 180,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderStyle: 'dashed',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  qr: { width: 130, height: 130 },
  text: { flex: 1, paddingLeft: 10 },
  name: { fontSize: 12, marginBottom: 4 },
  meta: { color: '#52525b', marginBottom: 2 },
  hint: { color: '#71717a', fontSize: 8, marginTop: 8 },
});

export async function renderQrCardsPdf(title: string, cards: readonly QrCard[]): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.grid}>
          {cards.map((c, i) => (
            <View key={i} style={styles.card} wrap={false}>
              <Image src={c.qrDataUrl} style={styles.qr} />
              <View style={styles.text}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.meta}>{c.formationTitle}</Text>
                <Text style={styles.meta}>{c.slotLabel}</Text>
                <Text style={styles.hint}>Scannez pour émarger : à l’arrivée, puis à la fin de la demi-journée.</Text>
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
  return await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}
