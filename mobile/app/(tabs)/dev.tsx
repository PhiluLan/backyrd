// mobile/app/(tabs)/dev.tsx
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { isInternalMobileUser } from "../../lib/internalAccess";
import { useEffect, useState } from "react";
import { AppText } from "../../components/foundation/AppText";
import { backyrdTheme as theme } from "../../theme/backyrd";

function DevRow({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowLeft}>
        <Ionicons accessibilityElementsHidden name={icon} size={20} color={theme.color.textPrimary} />
        <View style={{ marginLeft: 12 }}>
          <AppText role="bodyStrong">{title}</AppText>
          <AppText role="caption" tone="secondary" style={styles.rowSubtitle}>{subtitle}</AppText>
        </View>
      </View>
      <Ionicons accessibilityElementsHidden name="chevron-forward" size={18} color={theme.color.textMuted} />
    </Pressable>
  );
}

export default function DevScreen() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const ok = isInternalMobileUser(data.session?.user ?? null);
      if (!cancelled) setAllowed(ok);

      if (!ok) {
        // keine Diskussion: raus aus DEV
        router.replace("/(tabs)");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) return null;

  return (
    <View style={styles.container}>
      <AppText role="displayM">INTERN</AppText>
      <AppText tone="secondary" style={styles.caption}>
        Diagnose und interne Produktwerkzeuge.
      </AppText>

      <View style={styles.card}>
        <DevRow
          title="Neuer Spot"
          subtitle="Manuell Spots anlegen"
          icon="add-circle-outline"
          onPress={() => router.push("/(tabs)/new-spot")}
        />
        <View style={styles.sep} />
        <DevRow
          title="Nachrichten"
          subtitle="Interner Nachrichtenbereich"
          icon="chatbubbles-outline"
          onPress={() => router.push("/(tabs)/messages")}
        />
        <View style={styles.sep} />
        <DevRow
          title="Erfolge"
          subtitle="Erfolge und Fortschritt prüfen"
          icon="trophy-outline"
          onPress={() => router.push("/(tabs)/achievements")}
        />
        <View style={styles.sep} />
        <DevRow
          title="App- & Release-Status"
          subtitle="Aktives Bundle und Update-Diagnostik"
          icon="pulse-outline"
          onPress={() => router.push("/(tabs)/release-diagnostics")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  caption: {
    marginTop: 6,
    lineHeight: 21,
  },
  card: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowPressed: {
    backgroundColor: theme.color.surfaceElevated,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowSubtitle: {
    marginTop: 2,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
  },
});
