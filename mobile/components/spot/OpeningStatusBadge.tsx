import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "../foundation/AppText";
import { SPOT_OPENING_STATUS_COPY, type SpotOpeningStatus } from "../../lib/spot-opening-status";
import { backyrdTheme as theme } from "../../theme/backyrd";
const statusColor: Record<SpotOpeningStatus, string> = { open: theme.color.openGreen, closed: theme.color.danger, openingSoon: theme.color.warning, closingSoon: theme.color.closingSoon, unknown: theme.color.textSecondary };
/** Describes documented hours only; never changes discovery order. */
export function OpeningStatusBadge({ status, style }: { status: SpotOpeningStatus; style?: StyleProp<ViewStyle> }) {
 const color = statusColor[status];
 return <View style={[styles.root, { borderColor: color }, style]}><View style={[styles.dot, { backgroundColor: color }]} /><AppText role="caption" style={{ color, flexShrink: 1 }}>{SPOT_OPENING_STATUS_COPY[status]}</AppText></View>;
}
const styles = StyleSheet.create({ root: { alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xxs, borderRadius: theme.radius.pill, borderWidth: 1, backgroundColor: "rgba(5,5,5,0.9)" }, dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 } });
