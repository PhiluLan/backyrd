import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

type Props = {
  initialPrivate: boolean;
  onChanged: (isPrivate: boolean) => void;
};

export default function ProfilePrivacyCard({
  initialPrivate,
  onChanged,
}: Props) {
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [busy, setBusy] = useState(false);

  const apply = async (next: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "set_my_profile_privacy_v1",
        { p_is_private: next },
      );
      if (error) throw error;

      setIsPrivate(next);
      onChanged(next);

      const row = Array.isArray(data) ? data[0] : data;
      if (next) {
        Alert.alert(
          "Konto ist privat",
          `Dein Profil und deine Moments sind nicht mehr öffentlich. ${
            Number(row?.removed_follower_count ?? 0)
          } Follower wurden entfernt.`,
        );
      }
    } catch (error: any) {
      Alert.alert(
        "Privatstatus konnte nicht geändert werden",
        error?.message || "Bitte erneut versuchen.",
      );
    } finally {
      setBusy(false);
    }
  };

  const requestChange = (next: boolean) => {
    if (!next) {
      void apply(false);
      return;
    }

    Alert.alert(
      "Konto privat setzen?",
      "Dein Profil verschwindet aus der Suche, bestehende Follower werden entfernt und deine Moments sind für andere nicht mehr sichtbar. Reviews bleiben auf Spotseiten sichtbar.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Privat setzen",
          style: "destructive",
          onPress: () => void apply(true),
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons
          name={isPrivate ? "lock-closed" : "globe-outline"}
          size={21}
          color="#FF7DA7"
        />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>
          {isPrivate ? "Privates Konto" : "Öffentliches Konto"}
        </Text>
        <Text style={styles.body}>
          {isPrivate
            ? "Nicht auffindbar, keine neuen Follower und keine öffentlichen Moments."
            : "Andere Nutzer können dich finden, dir folgen und deine Moments sehen."}
        </Text>
      </View>

      <Switch
        value={isPrivate}
        onValueChange={requestChange}
        disabled={busy}
        trackColor={{ false: "#34343B", true: "rgba(255,125,167,0.45)" }}
        thumbColor={isPrivate ? "#FF7DA7" : "#D7D7DC"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginTop: 16,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,125,167,0.11)",
  },
  copy: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  body: {
    marginTop: 4,
    color: "#A9A9B1",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
