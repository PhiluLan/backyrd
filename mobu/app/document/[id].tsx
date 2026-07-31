import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, EmptyState, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useDocumentsStore } from '@/store/documents';
import { formatDate, formatMoney } from '@/utils/format';

const kindLabels = { invoice: 'Rechnung', receipt: 'Quittung', contract: 'Vertrag', warranty: 'Garantie' } as const;

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocumentsStore((state) => state.documents.find((item) => item.id === id));
  const markPaid = useDocumentsStore((state) => state.markPaid);

  if (!document) {
    return <Screen><EmptyState icon="document-outline" title="Dokument nicht gefunden" description="Dieses Dokument ist nicht mehr verfügbar." /></Screen>;
  }

  async function handleMarkPaid(documentId: string) {
    markPaid(documentId);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: document.title }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.documentIcon}><Ionicons name="document-text-outline" size={28} color={colors.primary} /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{document.title}</Text>
            <Text style={styles.sender}>{document.sender}</Text>
          </View>
          <Badge label={document.status === 'open' ? 'Offen' : document.status === 'paid' ? 'Bezahlt' : 'Aktiv'} tone={document.status === 'open' ? 'warning' : 'success'} />
        </View>

        <Card style={styles.preview}>
          <Ionicons name="document-attach-outline" size={38} color={colors.primary} />
          <Text numberOfLines={1} style={styles.fileName}>{document.fileName}</Text>
          <Text style={styles.fileMeta}>Originaldokument sicher gespeichert</Text>
          <SecondaryButton label="Dokument ansehen" icon="eye-outline" onPress={() => {}} />
        </Card>

        <Card style={styles.details}>
          <DetailRow label="Betrag" value={formatMoney(document.amount, document.currency)} />
          <DetailRow label="Dokumenttyp" value={kindLabels[document.kind]} />
          <DetailRow label="Dokumentdatum" value={formatDate(document.documentDate)} />
          <DetailRow label="Fällig am" value={formatDate(document.dueDate)} />
          <DetailRow label="Kategorie" value={document.category} last />
        </Card>

        <View style={styles.confidence}>
          <Ionicons name="sparkles-outline" size={18} color={colors.success} />
          <Text style={styles.confidenceText}>Mit {Math.round(document.confidence * 100)} % Erkennungssicherheit analysiert</Text>
        </View>

        {document.status === 'open' ? <PrimaryButton label="Als bezahlt markieren" icon="checkmark-circle-outline" onPress={() => handleMarkPaid(document.id)} /> : null}
        <SecondaryButton label="Erinnerung einstellen" icon="notifications-outline" onPress={() => {}} />
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.lastRow]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  documentIcon: { width: 54, height: 54, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sender: { color: colors.textMuted, fontSize: 14 },
  preview: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  fileName: { maxWidth: '90%', color: colors.text, fontSize: 15, fontWeight: '700' },
  fileMeta: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  details: { paddingVertical: spacing.xs },
  detailRow: { minHeight: 52, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lastRow: { borderBottomWidth: 0 },
  detailLabel: { color: colors.textMuted, fontSize: 14 },
  detailValue: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  confidence: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  confidenceText: { color: colors.textMuted, fontSize: 12 },
});
