import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DocumentRow } from '@/components/document-row';
import { Card, PrimaryButton, Screen, SecondaryButton, SectionTitle } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useDocumentsStore } from '@/store/documents';
import { formatMoney } from '@/utils/format';

export default function HomeScreen() {
  const documents = useDocumentsStore((state) => state.documents);
  const openInvoices = documents.filter((document) => document.kind === 'invoice' && document.status === 'open');
  const openTotal = openInvoices.reduce((sum, document) => sum + (document.amount ?? 0), 0);
  const monthTotal = documents
    .filter((document) => document.documentDate.startsWith('2026-07'))
    .reduce((sum, document) => sum + (document.amount ?? 0), 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.eyebrow}>Guten Morgen, Philipp</Text>
            <Text style={styles.title}>Deine Übersicht</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>P</Text></View>
        </View>

        <View style={styles.stats}>
          <Card style={styles.statCard}>
            <View style={styles.statIcon}><Ionicons name="time-outline" size={20} color={colors.warning} /></View>
            <Text style={styles.statLabel}>Offene Rechnungen</Text>
            <Text style={styles.statValue}>{formatMoney(openTotal)}</Text>
            <Text style={styles.statMeta}>{openInvoices.length} Zahlungen ausstehend</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={styles.statIcon}><Ionicons name="wallet-outline" size={20} color={colors.success} /></View>
            <Text style={styles.statLabel}>Erkannte Ausgaben</Text>
            <Text style={styles.statValue}>{formatMoney(monthTotal)}</Text>
            <Text style={styles.statMeta}>im Juli 2026</Text>
          </Card>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Dokument erfassen" icon="scan-outline" onPress={() => router.push('/capture')} />
          <SecondaryButton label="Dokument suchen" icon="search-outline" onPress={() => router.push('/documents')} />
        </View>

        <View style={styles.section}>
          <SectionTitle title="Als Nächstes" />
          {openInvoices.slice(0, 3).map((document) => (
            <DocumentRow key={document.id} document={document} onPress={() => router.push(`/document/${document.id}`)} />
          ))}
        </View>

        <Card style={styles.insightCard}>
          <View style={styles.insightIcon}><Ionicons name="sparkles" size={21} color={colors.primary} /></View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightTitle}>MoBu Insight</Text>
            <Text style={styles.insightText}>Deine erkannten Ausgaben liegen diesen Monat unter deinem bisherigen Durchschnitt.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.textMuted, fontSize: 14, marginBottom: 3 },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, gap: spacing.sm, minHeight: 172 },
  statIcon: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  actions: { gap: spacing.md },
  section: { gap: spacing.xs },
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  insightIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  insightCopy: { flex: 1, gap: 4 },
  insightTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  insightText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
