import { backyrdTheme } from "../theme/backyrd";
// mobile/app/legal-consent.tsx

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ProductText as Text } from "../components/foundation/AppText";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  acceptLegalDocument,
  getMyPendingLegalDocuments,
  getMyLegalGateStatus,
} from "@/lib/consent";
import { StateView } from "@/components/foundation/StateView";

import type { PendingLegalDocument as PendingDocument } from "../../packages/shared/src/consent-presentation";

export default function LegalConsentScreen() {
  const router = useRouter();
  const pending = useRef(false);
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true); setErrorMessage(null);
    try {
      const documents = await getMyPendingLegalDocuments();
      const status = await getMyLegalGateStatus();
      if (typeof status?.gate_required !== "boolean" || (documents.length === 0 && status.gate_required)) throw new Error("legal_status_unavailable");
      setDocuments(documents);
    } catch {
      setErrorMessage("Dokumente konnten gerade nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  async function acceptAll() {
    if (pending.current) return;
    pending.current = true; setErrorMessage(null);
    setAccepting(true);
    try {
      for (const document of documents) {
        if (!(await acceptLegalDocument(document.document_id))) throw new Error("legal_acceptance_not_confirmed");
      }
      const status = await getMyLegalGateStatus();
      if (status?.gate_required !== false) throw new Error("legal_gate_not_clear");
      router.replace("/gate" as never);
    } catch {
      setErrorMessage("Die Bestätigung konnte nicht gespeichert werden. Bitte versuche es nochmals.");
    } finally {
      pending.current = false;
      setAccepting(false);
    }
  }

  if (loading) {
    return <StateView kind="loading" title="Dokumente werden geladen" />;
  }

  if (errorMessage && documents.length === 0) {
    return <StateView kind="error" title="Kurz den Faden verloren" message={errorMessage} actionLabel="Noch einmal versuchen" onAction={() => { setErrorMessage(null); void load(); }} />;
  }

  if (documents.length === 0) {
    return <StateView kind="empty" title="Alles bestätigt" message="Du hast alle aktuell erforderlichen Dokumente bestätigt." actionLabel="Weiter zu Backyrd" onAction={() => void acceptAll()} />;
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
        {errorMessage ? <Text accessibilityLiveRegion="polite" style={styles.inlineError}>{errorMessage}</Text> : null}

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
  safe: { flex: 1, backgroundColor: backyrdTheme.color.background },
  loading: {
    flex: 1,
    backgroundColor: backyrdTheme.color.background,
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
    color: backyrdTheme.color.textPrimary,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 8,
  },
  lead: { color: backyrdTheme.color.textSecondary, fontSize: 16, lineHeight: 22, marginTop: 8 },
  documentCard: {
    backgroundColor: backyrdTheme.color.surface,
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
  },
  documentTitle: { color: backyrdTheme.color.textPrimary, fontSize: 22, fontWeight: "900" },
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
  buttonText: { color: backyrdTheme.color.onAccent, fontWeight: "900", fontSize: 16 },
  inlineError: { marginTop: 16, padding: 12, borderRadius: 14, color: "#FFD1DF", backgroundColor: "rgba(255,79,145,0.13)", fontSize: 14, lineHeight: 20 },
});
