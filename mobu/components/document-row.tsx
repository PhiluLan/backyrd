import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { MobuDocument } from '@/types/document';
import { formatDate, formatMoney } from '@/utils/format';

const kindIcons: Record<MobuDocument['kind'], keyof typeof Ionicons.glyphMap> = {
  invoice: 'receipt-outline',
  receipt: 'bag-handle-outline',
  contract: 'document-text-outline',
  warranty: 'shield-checkmark-outline',
};

export function DocumentRow({ document, onPress }: { document: MobuDocument; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${document.title} öffnen`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}><Ionicons name={kindIcons[document.kind]} size={21} color={colors.primary} /></View>
      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.title}>{document.title}</Text>
        <Text numberOfLines={1} style={styles.meta}>{document.sender} · {formatDate(document.documentDate)}</Text>
      </View>
      <View style={styles.end}>
        <Text style={styles.amount}>{formatMoney(document.amount, document.currency)}</Text>
        {document.status === 'open' ? <Badge label="Offen" tone="warning" /> : null}
        {document.status === 'paid' ? <Text style={styles.status}>Bezahlt</Text> : null}
        {document.status === 'active' ? <Text style={styles.status}>Aktiv</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.6 },
  icon: { width: 42, height: 42, borderRadius: radii.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  end: { alignItems: 'flex-end', gap: 4 },
  amount: { color: colors.text, fontSize: 14, fontWeight: '700' },
  status: { color: colors.textMuted, fontSize: 12 },
});
