import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SectionTitle } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useDocumentsStore } from '@/store/documents';
import { DocumentCategory } from '@/types/document';
import { formatMoney } from '@/utils/format';

const chartColors = [colors.chart[0], colors.chart[1], colors.chart[2], colors.chart[3]];

export default function InsightsScreen() {
  const documents = useDocumentsStore((state) => state.documents);
  const expenses = documents.filter((document) => document.amount !== undefined);
  const total = expenses.reduce((sum, document) => sum + (document.amount ?? 0), 0);
  const categoryTotals = expenses.reduce<Partial<Record<DocumentCategory, number>>>((result, document) => {
    result[document.category] = (result[document.category] ?? 0) + (document.amount ?? 0);
    return result;
  }, {});
  const categories = Object.entries(categoryTotals).sort(([, first], [, second]) => second - first).slice(0, 4);
  const maximum = Math.max(...categories.map(([, amount]) => amount), 1);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>Finanzübersicht</Text>
          <Text style={styles.subtitle}>Automatisch aus deinen Dokumenten erstellt</Text>
        </View>

        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Erkannte Gesamtausgaben</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
          <Text style={styles.totalMeta}>{expenses.length} Dokumente mit Finanzdaten</Text>
        </Card>

        <View style={styles.section}>
          <SectionTitle title="Nach Kategorie" />
          <Card style={styles.chartCard}>
            {categories.map(([category, amount], index) => (
              <View key={category} style={styles.barRow}>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel}>{category}</Text>
                  <Text style={styles.barValue}>{formatMoney(amount)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max((amount / maximum) * 100, 8)}%`, backgroundColor: chartColors[index] }]} />
                </View>
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Laufende Verpflichtungen" />
          <Card>
            <View style={styles.commitmentRow}><Text style={styles.commitmentLabel}>Offene Rechnungen</Text><Text style={styles.commitmentValue}>{documents.filter((document) => document.status === 'open').length}</Text></View>
            <View style={styles.commitmentRow}><Text style={styles.commitmentLabel}>Aktive Verträge</Text><Text style={styles.commitmentValue}>{documents.filter((document) => document.status === 'active').length}</Text></View>
            <View style={[styles.commitmentRow, styles.lastRow]}><Text style={styles.commitmentLabel}>Gespeicherte Garantien</Text><Text style={styles.commitmentValue}>{documents.filter((document) => document.kind === 'warranty').length}</Text></View>
          </Card>
        </View>

        <Card style={styles.insightCard}>
          <Text style={styles.insightEyebrow}>MOBU INSIGHT</Text>
          <Text style={styles.insightTitle}>Deine Dokumente werden zu klaren Entscheidungen.</Text>
          <Text style={styles.insightText}>Sobald mehr Ausgaben erkannt sind, zeigt MoBu Trends und wiederkehrende Kosten noch genauer.</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  totalCard: { backgroundColor: colors.primary, borderColor: colors.primary, gap: spacing.sm },
  totalLabel: { color: '#DDEAE4', fontSize: 13, fontWeight: '600' },
  totalValue: { color: '#FFFFFF', fontSize: 32, lineHeight: 38, fontWeight: '800' },
  totalMeta: { color: '#DDEAE4', fontSize: 12 },
  section: { gap: spacing.md },
  chartCard: { gap: spacing.lg },
  barRow: { gap: spacing.sm },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  barLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  barValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  barTrack: { height: 10, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill },
  commitmentRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lastRow: { borderBottomWidth: 0 },
  commitmentLabel: { color: colors.textMuted, fontSize: 14 },
  commitmentValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  insightCard: { backgroundColor: colors.primarySoft, gap: spacing.sm },
  insightEyebrow: { color: colors.success, fontSize: 11, letterSpacing: 1.2, fontWeight: '800' },
  insightTitle: { color: colors.primary, fontSize: 19, lineHeight: 25, fontWeight: '800' },
  insightText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
