import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";

type AppealReason =
  | "decision_incorrect"
  | "context_misunderstood"
  | "content_changed"
  | "account_compromised"
  | "policy_exception"
  | "other";

const reasons: {
  value: AppealReason;
  label: string;
}[] = [
  {
    value: "decision_incorrect",
    label: "Die Entscheidung ist falsch",
  },
  {
    value: "context_misunderstood",
    label: "Der Kontext wurde missverstanden",
  },
  {
    value: "content_changed",
    label: "Der Inhalt wurde inzwischen geändert",
  },
  {
    value: "account_compromised",
    label: "Mein Account war kompromittiert",
  },
  {
    value: "policy_exception",
    label: "Es gilt eine Richtlinien-Ausnahme",
  },
  {
    value: "other",
    label: "Anderer Grund",
  },
];

type Props = {
  caseId: string;
  contentPreview: string | null;
  disabled?: boolean;
  onSubmitted: () => void;
};

export default function AppealDecisionButton({
  caseId,
  contentPreview,
  disabled = false,
  onSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();

  const [visible, setVisible] = useState(false);
  const [reason, setReason] =
    useState<AppealReason>("context_misunderstood");
  const [statement, setStatement] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (statement.trim().length < 10) {
      Alert.alert(
        "Mehr Informationen nötig",
        "Bitte beschreibe deinen Einspruch mit mindestens 10 Zeichen.",
      );
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.rpc(
      "safety_submit_appeal_v1",
      {
        p_case_id: caseId,
        p_appeal_reason: reason,
        p_statement: statement.trim(),
      },
    );

    setSubmitting(false);

    if (error) {
      Alert.alert(
        "Einspruch nicht gesendet",
        error.message,
      );
      return;
    }

    setVisible(false);
    setStatement("");
    onSubmitted();

    Alert.alert(
      "Einspruch eingereicht",
      "Unser Safety-Team prüft die Entscheidung erneut.",
    );
  }

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Text style={styles.triggerText}>
          Entscheidung anfechten
        </Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          if (!submitting) setVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!submitting) setVisible(false);
            }}
          />

          <View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 10),
              },
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>
                  SAFETY & INTEGRITY
                </Text>
                <Text style={styles.title}>
                  Entscheidung anfechten
                </Text>
                <Text style={styles.subtitle}>
                  Erkläre uns, warum die Entscheidung erneut
                  geprüft werden sollte.
                </Text>
              </View>

              <Pressable
                onPress={() => setVisible(false)}
                disabled={submitting}
                style={styles.close}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#fff"
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === "ios"
                  ? "interactive"
                  : "on-drag"
              }
              showsVerticalScrollIndicator={false}
              bounces
            >
              <Text style={styles.label}>
                Betroffener Inhalt
              </Text>

              <View style={styles.preview}>
                <Text
                  style={styles.previewText}
                  numberOfLines={4}
                >
                  {contentPreview ||
                    "Kein Textinhalt vorhanden."}
                </Text>
              </View>

              <Text style={styles.label}>
                Grund für den Einspruch
              </Text>

              <View style={styles.reasonList}>
                {reasons.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => setReason(item.value)}
                    disabled={submitting}
                    style={styles.reasonRow}
                  >
                    <View
                      style={[
                        styles.radio,
                        reason === item.value &&
                          styles.radioSelected,
                      ]}
                    >
                      {reason === item.value ? (
                        <View style={styles.radioDot} />
                      ) : null}
                    </View>

                    <Text style={styles.reasonText}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>
                Deine Stellungnahme
              </Text>

              <TextInput
                value={statement}
                onChangeText={(value) =>
                  setStatement(value.slice(0, 4000))
                }
                multiline
                textAlignVertical="top"
                placeholder="Beschreibe den Kontext und warum die Entscheidung geändert werden sollte."
                placeholderTextColor="#686871"
                editable={!submitting}
                style={styles.input}
              />

              <Text style={styles.counter}>
                {statement.length}/4000
              </Text>

              <Pressable
                onPress={submit}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.submit,
                  pressed && styles.pressed,
                  submitting && styles.disabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>
                    Einspruch einreichen
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.74)",
  },
  sheet: {
    height: "92%",
    maxHeight: "94%",
    backgroundColor: "#111113",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    marginTop: 10,
    backgroundColor: "#3B3B41",
  },
  header: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: "#FF4F91",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 7,
  },
  title: {
    color: "#fff",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#96969F",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 48,
  },
  label: {
    color: "#F5F5F7",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 9,
  },
  preview: {
    padding: 15,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 21,
  },
  previewText: {
    color: "#D9D9DE",
    fontSize: 14,
    lineHeight: 20,
  },
  reasonList: {
    marginBottom: 21,
  },
  reasonRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#62626B",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: "#FF4F91",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF4F91",
  },
  reasonText: {
    flex: 1,
    color: "#E8E8EC",
    fontSize: 14,
    lineHeight: 19,
  },
  input: {
    minHeight: 150,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.035)",
    color: "#F6F6F8",
    fontSize: 14,
    lineHeight: 20,
  },
  counter: {
    marginTop: 8,
    alignSelf: "flex-end",
    color: "#73737C",
    fontSize: 12,
    fontWeight: "700",
  },
  trigger: {
    minHeight: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,79,139,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,79,139,0.24)",
  },
  triggerText: {
    color: "#FF4F91",
    fontSize: 14,
    fontWeight: "800",
  },
  submit: {
    minHeight: 56,
    marginTop: 18,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E93678",
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
