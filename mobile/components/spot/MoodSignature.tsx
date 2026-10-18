import { moodCountCopy } from "../../../packages/shared/src/presentation/mood";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../foundation/AppText";
import { backyrdTheme as theme } from "../../theme/backyrd";

export function MoodSignature({ labels, compact = false, onPress, onRemove, moodCount }: {
  labels: readonly string[]; compact?: boolean; moodCount?: number | null; onPress?: () => void; onRemove?: (label: string) => void;
}) {
  const visible = [...new Set(labels.filter(Boolean))].slice(0, 3);
  const countCopy = moodCountCopy(moodCount);
  if (!visible.length && !countCopy) return null;
  const content = <View style={styles.row}>
    {countCopy ? <AppText role="label" style={compact ? styles.compact : styles.label}>{countCopy}</AppText> : null}
    {visible.map((label, index) => <View key={label} style={styles.word}>
      {countCopy || index > 0 ? <AppText tone="secondary">·</AppText> : null}
      {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`${label} entfernen`} onPress={() => onRemove(label)} style={styles.touch}><AppText tone="pink" style={styles.label}>{label} ×</AppText></Pressable> : <AppText tone="pink" style={compact ? styles.compact : styles.label}>{label}</AppText>}
    </View>)}
  </View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${countCopy ? `${countCopy}. ` : ""}${visible.join(", ")}. Moods ansehen`} onPress={onPress} style={styles.touch}>{content}</Pressable> : content;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 7, rowGap: 4 },
  word: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { fontSize: 15, lineHeight: 22, fontFamily: theme.type.bodyMedium },
  compact: { fontSize: 14, lineHeight: 21, fontFamily: theme.type.bodyMedium },
  touch: { minHeight: 44, justifyContent: "center" },
});
