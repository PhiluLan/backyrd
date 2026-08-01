// mobile/app/privacy-consent.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ConsentPurposeKey,
  ConsentStateRow,
  getMyConsentState,
  setMyConsent,
} from "@/lib/consent";
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
} from "@/lib/notifications";

const ORDER: ConsentPurposeKey[] = [
  "personalized_recommendations",
  "optional_product_analytics",
  "precise_location",
  "push_notifications",
  "marketing_messages",
  "photo_ai_processing",
  "model_improvement",
];

const ICONS: Record<ConsentPurposeKey, keyof typeof Ionicons.glyphMap> = {
  personalized_recommendations: "sparkles-outline",
  optional_product_analytics: "analytics-outline",
  precise_location: "location-outline",
  push_notifications: "notifications-outline",
  marketing_messages: "mail-outline",
  photo_ai_processing: "image-outline",
  model_improvement: "git-network-outline",
};

export default function PrivacyConsentScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ConsentStateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ConsentPurposeKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getMyConsentState());
    } catch (error: any) {
      Alert.alert(
        "Datenschutz",
        error?.message ?? "Einwilligungen konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const optionalRows = useMemo(
    () =>
      ORDER.map((key) => rows.find((row) => row.purpose_key === key)).filter(
        (row): row is ConsentStateRow => Boolean(row),
      ),
    [rows],
  );

  async function toggle(row: ConsentStateRow, nextValue: boolean) {
    setSavingKey(row.purpose_key);

    try {
      await setMyConsent(row.purpose_key, nextValue, row.document_id);

      if (
        row.purpose_key === "precise_location" &&
        nextValue &&
        Platform.OS !== "web"
      ) {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (permission.status !== "granted") {
          await setMyConsent("precise_location", false, row.document_id);
          Alert.alert(
            "Standort nicht aktiviert",
            "Die Geräteberechtigung wurde nicht erteilt. Du kannst sie später in den iOS-Einstellungen freigeben.",
          );
        } else {
          Alert.alert(
            "Standort aktiviert",
            "Backyrd darf deinen aktuellen Standort verwenden. Auf der Map kannst du dich über den Locate-Button neu zentrieren.",
          );
        }
      }

      if (row.purpose_key === "push_notifications") {
        if (nextValue && Platform.OS !== "web") {
          const result = await registerForPushNotificationsAsync();

          if (result.status !== "granted") {
            await setMyConsent("push_notifications", false, row.document_id);
            Alert.alert("Push nicht aktiviert", result.message);
          } else {
            Alert.alert(
              "Push aktiviert",
              result.permissionWasAlreadyGranted
                ? "Die iOS-Berechtigung bestand bereits. Der Push-Token wurde jetzt mit deinem Backyrd-Konto verbunden."
                : result.message,
            );
          }
        } else if (!nextValue && Platform.OS !== "web") {
          await unregisterPushNotificationsAsync();
        }
      }

      await load();
    } catch (error: any) {
      Alert.alert(
        "Änderung nicht möglich",
        error?.message ?? "Bitte versuche es nochmals.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PRIVACY CENTER</Text>
          <Text style={styles.title}>Datenschutz & Einwilligungen</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#FF7DA7" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introCard}>
            <Ionicons name="shield-checkmark-outline" size={25} color="#FF7DA7" />
            <Text style={styles.introTitle}>Du entscheidest.</Text>
            <Text style={styles.introText}>
              Optionale Verarbeitungen sind standardmässig deaktiviert. Du kannst
              jede Einwilligung jederzeit ändern. Notwendige Sicherheits- und
              Kontofunktionen bleiben davon getrennt.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>OPTIONALE EINWILLIGUNGEN</Text>

          {optionalRows.map((row) => {
            const enabled = row.current_status === "granted";
            const saving = savingKey === row.purpose_key;

            return (
              <View key={row.purpose_key} style={styles.consentCard}>
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={ICONS[row.purpose_key]}
                    size={22}
                    color="#FF7DA7"
                  />
                </View>

                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{row.title_de}</Text>
                  <Text style={styles.cardText}>{row.description_de}</Text>
                  <Text style={styles.statusText}>
                    {enabled ? "Aktiv" : "Nicht aktiv"}
                    {row.granted_at
                      ? ` · seit ${new Date(row.granted_at).toLocaleDateString("de-CH")}`
                      : ""}
                  </Text>
                </View>

                {saving ? (
                  <ActivityIndicator color="#FF7DA7" />
                ) : (
                  <Switch
                    value={enabled}
                    onValueChange={(value) => void toggle(row, value)}
                    trackColor={{
                      false: "rgba(255,255,255,0.16)",
                      true: "rgba(255,125,167,0.48)",
                    }}
                    thumbColor={enabled ? "#FF7DA7" : "#D8D8DC"}
                  />
                )}
              </View>
            );
          })}

          <View style={styles.necessaryCard}>
            <Text style={styles.necessaryTitle}>Notwendige Verarbeitung</Text>
            <Text style={styles.necessaryText}>
              Konto, Authentifizierung, Sicherheit, Moderation und technisch
              notwendige Fehlerdiagnose können nicht über optionale Schalter
              deaktiviert werden.
            </Text>
          </View>

          <Text style={styles.footerText}>
            Aktuell sind die Rechtsdokumente noch nicht veröffentlicht. Das
            Consent Center ist bereits funktionsfähig; das Legal Gate bleibt bis
            zur kontrollierten Veröffentlichung inaktiv.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 13,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: "#FF7DA7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 2,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 46 },
  introCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#151519",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.22)",
    marginBottom: 25,
  },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 12,
  },
  introText: {
    color: "#B9B9C1",
    lineHeight: 21,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#8E8E99",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
    marginBottom: 10,
  },
  consentCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 15,
    backgroundColor: "#151519",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,125,167,0.10)",
    marginRight: 13,
  },
  cardCopy: { flex: 1, paddingRight: 12 },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  cardText: { color: "#AFAFB7", fontSize: 13, lineHeight: 18, marginTop: 4 },
  statusText: {
    color: "#777782",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  necessaryCard: {
    marginTop: 15,
    borderRadius: 20,
    padding: 17,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  necessaryTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  necessaryText: { color: "#A3A3AC", lineHeight: 19, marginTop: 7 },
  footerText: {
    color: "#73737D",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 12,
  },
});
