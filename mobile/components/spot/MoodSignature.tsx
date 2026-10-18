import { reviewCountCopy } from "../../../packages/shared/src/presentation/mood";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../foundation/AppText";
import { backyrdTheme as theme } from "../../theme/backyrd";

/** The same qualitative Spot identity on a card, in a list and in the Spot head. */
export function MoodSignature({ labels, compact = false, onPress, onRemove, reviewCount }: {
  labels: readonly string[]; compact?: boolean; reviewCount?: number | null; onPress?: () => void; onRemove?: (label: string) => void;
}) {
  const visible = [...new Set(labels.filter(Boolean))].slice(0, 3);
  const countCopy = reviewCountCopy(reviewCount);
  if (!visible.length && !countCopy) return null;
  const content = <View style={[styles.identity, compact && styles.compact]}>
    {visible.length ? <AppText role="caption" tone="pink" style={styles.wordmark}>MOODS</AppText> : null}
    <View style={styles.words}>{visible.map((label, index) => <View key={label} style={styles.word}>
      {index > 0 ? <AppText tone="pink" style={styles.separator}>·</AppText> : null}
      {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`${label} entfernen`} onPress={() => onRemove(label)} style={styles.touch}><AppText role="bodyStrong" tone="pink" style={styles.label}>{label} ×</AppText></Pressable> : <AppText role={compact ? "label" : "bodyStrong"} tone="pink" style={compact ? styles.compactLabel : styles.label}>{label}</AppText>}
    </View>)}</View>
    {countCopy ? <AppText role="caption" tone="secondary">{countCopy}</AppText> : null}
  </View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`Moods: ${visible.join(", ")}.${countCopy ? ` ${countCopy}.` : ""} Eindrücke ansehen`} onPress={onPress} style={({ pressed }) => [styles.touch, pressed && styles.pressed]}>{content}</Pressable> : content;
}
const styles = StyleSheet.create({
  identity: { gap: 5 }, compact: { gap: 3 }, wordmark: { fontSize: 9, lineHeight: 13, letterSpacing: 2.4, fontFamily: theme.type.bodyBold },
  words: { flexDirection: "row", flexWrap: "wrap", columnGap: 9, rowGap: 2 }, word: { flexDirection: "row", alignItems: "center", gap: 9 },
  label: { fontSize: 21, lineHeight: 29, fontFamily: theme.type.bodyMedium }, compactLabel: { fontSize: 17, lineHeight: 24 }, separator: { fontSize: 20, lineHeight: 24 },
  touch: { minHeight: 48, justifyContent: "center" }, pressed: { opacity: .75 },
});
