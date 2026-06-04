// mobile/app/(tabs)/dev.tsx
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useEffect, useState } from "react";

const DEV_EMAIL = "philipplanger@yahoo.com";

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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color="#fff" />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#777" />
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
      const email = (data.session?.user?.email ?? "").toLowerCase();
      const ok = email === DEV_EMAIL.toLowerCase();
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
      <Text style={styles.title}>DEV</Text>
      <Text style={styles.caption}>
        Interne Tools. Nicht Teil der User-UX.
      </Text>

      <View style={styles.card}>
        <DevRow
          title="New Spot"
          subtitle="Manuell Spots anlegen"
          icon="add-circle-outline"
          onPress={() => router.push("/(tabs)/new-spot")}
        />
        <View style={styles.sep} />
        <DevRow
          title="Messages"
          subtitle="Interne Inbox / Debug"
          icon="chatbubbles-outline"
          onPress={() => router.push("/(tabs)/messages")}
        />
        <View style={styles.sep} />
        <DevRow
          title="Achievements"
          subtitle="Badges / Progress debuggen"
          icon="trophy-outline"
          onPress={() => router.push("/(tabs)/achievements")}
        />
        <View style={styles.sep} />
        <DevRow
          title="Achievements"
          subtitle="Badges / Progress debuggen"
          icon="trophy-outline"
          onPress={() => router.push("/(tabs)/decision-debug")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  caption: {
    marginTop: 6,
    color: "#9a9a9a",
    fontSize: 14,
    lineHeight: 19,
  },
  card: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#222",
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  rowSubtitle: {
    marginTop: 2,
    color: "#9a9a9a",
    fontSize: 13,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#222",
  },
});
