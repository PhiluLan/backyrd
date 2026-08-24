// mobile/app/legal-consent.tsx

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  acceptLegalDocument,
  getMyPendingLegalDocuments,
} from "@/lib/consent";

type PendingDocument = {
  document_id: string;
  document_type: string;
  version: string;
  title: string;
  summary: string | null;
  content_markdown: string;
  effective_at: string;
};

export default function LegalConsentScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setDocuments(
        (await getMyPendingLegalDocuments()) as PendingDocument[],
      );
    } catch (error: any) {
      Alert.alert(
        "Rechtsdokumente",
        error?.message ?? "Dokumente konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function acceptAll() {
    setAccepting(true);
    try {
      for (const document of documents) {
        await acceptLegalDocument(document.document_id);
      }
      router.replace("/(tabs)" as never);
    } catch (error: any) {
      Alert.alert(
        "Bestätigung fehlgeschlagen",
        error?.message ?? "Bitte versuche es nochmals.",
      );
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#FF4F91" />
      </View>
    );
  }

  if (documents.length === 0) {
    return (
      <View style={styles.loading}>
        <Text style={styles.emptyTitle}>Alles bestätigt</Text>
        <Pressable
          style={styles.button}
          onPress={() => router.replace("/(tabs)" as never)}
        >
          <Text style={styles.buttonText}>Weiter zu Backyrd</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>WICHTIGE DOKUMENTE</Text>
        <Text style={styles.title}>Bevor du weitermachst</Text>
        <Text style={styles.lead}>
          Bitte lies und bestätige die aktuell gültigen Dokumente.
        </Text>

        {documents.map((document) => (
          <View key={document.document_id} style={styles.documentCard}>
            <Text style={styles.documentTitle}>{document.title}</Text>
            <Text style={styles.version}>Version {document.version}</Text>
            {!!document.summary && (
              <Text style={styles.summary}>{document.summary}</Text>
            )}
            <Text style={styles.contentText}>
              {document.content_markdown}
            </Text>
          </View>
        ))}

        <Pressable
          style={[styles.button, accepting && styles.buttonDisabled]}
          disabled={accepting}
          onPress={() => void acceptAll()}
        >
          {accepting ? (
            <ActivityIndicator color="#050506" />
          ) : (
            <Text style={styles.buttonText}>
              Dokumente bestätigen
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050506" },
  loading: {
    flex: 1,
    backgroundColor: "#050506",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: { padding: 22, paddingBottom: 50 },
  eyebrow: {
    color: "#FF4F91",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.35,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 8,
  },
  lead: { color: "#AFAFB7", fontSize: 16, lineHeight: 22, marginTop: 8 },
  documentCard: {
    backgroundColor: "#111113",
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
  },
  documentTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  version: { color: "#FF4F91", fontWeight: "800", marginTop: 5 },
  summary: { color: "#BEBEC6", lineHeight: 20, marginTop: 12 },
  contentText: { color: "#A6A6AF", lineHeight: 21, marginTop: 18 },
  button: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#FF4F91",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#050506", fontWeight: "900", fontSize: 16 },
  emptyTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
});
