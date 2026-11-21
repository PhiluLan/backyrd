import React, { useRef, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { backyrdTheme as theme } from "../theme/backyrd";
import { AppText } from "./foundation/AppText";
import { userFacingError } from "../lib/userFacingError";

type Props = {
  initialPrivate: boolean;
  onChanged: (isPrivate: boolean) => void;
};

export default function ProfilePrivacyCard({
  initialPrivate,
  onChanged,
}: Props) {
  const pending = useRef(false);
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [busy, setBusy] = useState(false);

  const apply = async (next: boolean) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "set_my_profile_privacy_v1",
        { p_is_private: next },
      );
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (row?.is_private !== next) throw new Error("privacy_save_not_confirmed");
      setIsPrivate(next);
      onChanged(next);

      if (next) {
        Alert.alert(
          "Konto ist privat",
          `Dein Profil und deine Momente sind nicht mehr öffentlich. ${
            Number(row?.removed_follower_count ?? 0)
          } Follower und ${Number(row?.removed_following_count ?? 0)} Folge-Verbindungen wurden entfernt.`,
        );
      }
    } catch (error: unknown) {
      Alert.alert(
        "Privatstatus konnte nicht geändert werden",
        userFacingError(error, "Deine Sichtbarkeit konnte gerade nicht geändert werden."),
      );
    } finally {
      pending.current = false; setBusy(false);
    }
  };

  const requestChange = (next: boolean) => {
    if (!next) {
      void apply(false);
      return;
    }

    Alert.alert(
      "Konto privat setzen?",
      "Dein Profil verschwindet aus der Suche, bestehende Follower und deine Folge-Verbindungen werden entfernt und deine Momente sind für andere nicht mehr sichtbar. Deine Momente mit Ortsbezug bleiben gegebenenfalls auf den Ortsseiten sichtbar. Das erneute Öffentlichstellen stellt die Verbindungen nicht wieder her.",
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
      <View style={styles.heading}>
        <View style={styles.icon}><Ionicons accessibilityElementsHidden name={isPrivate ? "lock-closed" : "globe-outline"} size={22} color={theme.color.pink} /></View>
        <AppText role="bodyStrong" style={styles.copy}>{isPrivate ? "Privates Konto" : "Öffentliches Konto"}</AppText>
      <Switch
        accessibilityLabel="Profil privat anzeigen"
        accessibilityHint={
          isPrivate
            ? "Deaktivieren macht dein Profil wieder öffentlich."
            : "Aktivieren setzt dein Profil nach Bestätigung auf privat."
        }
        accessibilityState={{ checked: isPrivate, disabled: busy, busy }}
        value={isPrivate}
        onValueChange={requestChange}
        disabled={busy}
        trackColor={{ false: theme.color.surfaceElevated, true: "rgba(255,79,145,0.42)" }}
        thumbColor={isPrivate ? theme.color.pink : theme.color.textSecondary}
      />
      </View>
      <AppText role="body" tone="secondary" style={styles.body}>{isPrivate
        ? "Dein Profil ist in der Suche verborgen. Neue Follower und Markierungen sind deaktiviert. Wer deinen vollständigen Nutzernamen kennt, kann dir weiterhin schreiben. Blockieren verhindert Kontakt."
        : "Andere können dein Profil finden, dir folgen und deine Momente sehen."}</AppText>
      {isPrivate ? <AppText role="meta" tone="secondary">Momente mit Ortsbezug können weiterhin auf den Ortsseiten sichtbar sein.</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 0,
    marginTop: 0,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    gap: 16,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,79,145,0.11)",
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1 },
  body: {
    lineHeight: 24,
  },
});
