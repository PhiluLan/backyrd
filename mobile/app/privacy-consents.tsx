// mobile/app/privacy-consents.tsx

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

import { supabase } from "@/lib/supabase";

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
  const [sendingTestPush, setSendingTestPush] = useState(false);

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

  async function confirmDisablePreciseLocation() {
    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Smart Review deaktivieren?",
        "Ohne präzisen Standort kannst du keine Smart Reviews erstellen. Discovery, Map, Decision und dein Profil bleiben weiterhin nutzbar.",
        [
          {
            text: "Abbrechen",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Standort deaktivieren",
            style: "destructive",
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }

  async function toggle(row: ConsentStateRow, nextValue: boolean) {
    if (
      row.purpose_key === "precise_location" &&
      !nextValue
    ) {
      const confirmed = await confirmDisablePreciseLocation();
      if (!confirmed) return;
    }
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
            "Smart Review ist jetzt freigeschaltet. Backyrd darf deinen aktuellen Standort außerdem für aktive Standortfunktionen wie den Locate-Button verwenden.",
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

  async function sendTestPush() {
    setSendingTestPush(true);

    try {
      const pushRow = rows.find(
        (row) => row.purpose_key === "push_notifications",
      );

      if (pushRow?.current_status !== "granted") {
        Alert.alert(
          "Push deaktiviert",
          "Aktiviere zuerst Push-Benachrichtigungen.",
        );
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "send-test-push",
        {
          body: {
            title: "Backyrd Test",
            body: "Yes! Deine Push-Benachrichtigungen funktionieren 🎉",
          },
        },
      );

      if (error) throw error;

      const sentCount =
        typeof data?.sent_count === "number" ? data.sent_count : 0;

      if (sentCount < 1) {
        throw new Error(
          data?.message ??
            "Für dein Konto wurde kein aktives Push-Gerät gefunden.",
        );
      }

      Alert.alert(
        "Test-Push versendet",
        `Die Nachricht wurde an ${sentCount} Gerät${
          sentCount === 1 ? "" : "e"
        } übergeben. Lege Backyrd kurz in den Hintergrund, falls du den Banner testen möchtest.`,
      );
    } catch (error: any) {
      Alert.alert(
        "Test-Push fehlgeschlagen",
        error?.message ?? "Die Benachrichtigung konnte nicht versendet werden.",
      );
    } finally {
      setSendingTestPush(false);
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
              Du kannst Backyrd ohne Standort durchsuchen und Spots entdecken.
              Für Smart Review ist der präzise Standort erforderlich, weil der Spot
              während der Aufnahme automatisch erkannt wird. Du kannst die
              Freigabe jederzeit widerrufen; Smart Review wird dann deaktiviert.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>FUNKTIONEN & EINWILLIGUNGEN</Text>

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
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>{row.title_de}</Text>
                    {row.purpose_key === "precise_location" ? (
                      <View style={styles.smartReviewBadge}>
                        <Text style={styles.smartReviewBadgeText}>
                          Smart Review
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardText}>{row.description_de}</Text>
                  <Text style={styles.statusText}>
                    {row.purpose_key === "precise_location"
                      ? enabled
                        ? "Smart Review freigeschaltet"
                        : "Smart Review deaktiviert"
                      : enabled
                        ? "Aktiv"
                        : "Nicht aktiv"}
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

          <Pressable
            style={[
              styles.testPushButton,
              sendingTestPush && styles.testPushButtonDisabled,
            ]}
            disabled={sendingTestPush}
            onPress={() => void sendTestPush()}
          >
            {sendingTestPush ? (
              <ActivityIndicator color="#09090A" />
            ) : (
              <>
                <Ionicons
                  name="paper-plane-outline"
                  size={20}
                  color="#09090A"
                />
                <Text style={styles.testPushButtonText}>
                  Test-Benachrichtigung senden
                </Text>
              </>
            )}
          </Pressable>

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
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  smartReviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,125,167,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.25)",
  },
  smartReviewBadgeText: {
    color: "#FFD4E0",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  cardText: { color: "#AFAFB7", fontSize: 13, lineHeight: 18, marginTop: 4 },
  statusText: {
    color: "#777782",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  testPushButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#FF7DA7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 14,
    marginBottom: 2,
    paddingHorizontal: 18,
  },
  testPushButtonDisabled: { opacity: 0.58 },
  testPushButtonText: {
    color: "#09090A",
    fontSize: 15,
    fontWeight: "900",
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
