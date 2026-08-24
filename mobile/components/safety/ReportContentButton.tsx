import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
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

import { supabase } from "../../lib/supabase";

export type ReportableContentType =
  | "review"
  | "moment"
  | "comment"
  | "profile"
  | "spot"
  | "owner_spot_profile";

export type ReportReason =
  | "hate_discrimination"
  | "harassment_bullying"
  | "violence_threat"
  | "sexual_content"
  | "self_harm"
  | "spam_fraud"
  | "false_spot_information"
  | "privacy_personal_data"
  | "illegal_dangerous_goods"
  | "other";

type ReportReasonOption = {
  value: ReportReason;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const REASONS: ReportReasonOption[] = [
  {
    value: "hate_discrimination",
    title: "Hass oder Diskriminierung",
    description:
      "Angriffe oder Ausgrenzung aufgrund persönlicher Merkmale.",
    icon: "people-outline",
  },
  {
    value: "harassment_bullying",
    title: "Belästigung oder Mobbing",
    description:
      "Beleidigungen, Demütigung oder gezielte Belästigung.",
    icon: "chatbubble-ellipses-outline",
  },
  {
    value: "violence_threat",
    title: "Gewalt oder Bedrohung",
    description:
      "Gewaltdrohungen, Aufrufe zu Gewalt oder gefährliche Inhalte.",
    icon: "warning-outline",
  },
  {
    value: "sexual_content",
    title: "Sexuelle Inhalte",
    description:
      "Unangemessene sexuelle oder nicht einvernehmliche Inhalte.",
    icon: "eye-off-outline",
  },
  {
    value: "self_harm",
    title: "Selbstgefährdung",
    description:
      "Inhalte zu Selbstverletzung oder akuter Selbstgefährdung.",
    icon: "heart-dislike-outline",
  },
  {
    value: "spam_fraud",
    title: "Spam oder Betrug",
    description:
      "Irreführende Werbung, Scams oder manipulierte Inhalte.",
    icon: "shield-outline",
  },
  {
    value: "false_spot_information",
    title: "Falsche Spot-Informationen",
    description:
      "Informationen über einen Spot sind offensichtlich falsch.",
    icon: "location-outline",
  },
  {
    value: "privacy_personal_data",
    title: "Privatsphäre",
    description:
      "Private Daten, Telefonnummern oder persönliche Informationen.",
    icon: "lock-closed-outline",
  },
  {
    value: "illegal_dangerous_goods",
    title: "Illegale oder gefährliche Angebote",
    description:
      "Illegale Waren, gefährliche Dienstleistungen oder Handel.",
    icon: "ban-outline",
  },
  {
    value: "other",
    title: "Anderer Grund",
    description:
      "Etwas anderes verstößt möglicherweise gegen die Richtlinien.",
    icon: "ellipsis-horizontal-circle-outline",
  },
];

export type ReportContentButtonProps = {
  entityType: string;
  entityId: string;
  contentType: ReportableContentType;
  actorUserId?: string | null;
  spotId?: string | null;
  textContent?: string | null;
  imageUrls?: string[];
  locale?: string;
  sourceSurface: string;
  sourceContext?: Record<string, unknown>;
  disabled?: boolean;
  iconOnly?: boolean;
  onSubmitted?: (result: {
    duplicate: boolean;
    reportId: string;
    caseId?: string;
  }) => void;
};

type Step = "reason" | "details" | "success";

export default function ReportContentButton({
  entityType,
  entityId,
  contentType,
  actorUserId = null,
  spotId = null,
  textContent = null,
  imageUrls = [],
  locale = "de-CH",
  sourceSurface,
  sourceContext = {},
  disabled = false,
  iconOnly = true,
  onSubmitted,
}: ReportContentButtonProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const selectedReason = useMemo(
    () => REASONS.find((item) => item.value === reason) ?? null,
    [reason],
  );

  function reset() {
    setStep("reason");
    setReason(null);
    setDetails("");
    setSubmitting(false);
    setDuplicate(false);
  }

  function open() {
    reset();
    setVisible(true);
  }

  function close() {
    if (submitting) return;
    setVisible(false);
    setTimeout(reset, 200);
  }

  async function submitReport() {
    if (!reason || submitting) return;

    setSubmitting(true);

    try {
      const { data: contentItemResult, error: contentItemError } =
        await supabase.rpc(
          "safety_get_or_create_reportable_content_v1",
          {
            p_content_type: contentType,
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_actor_user_id: actorUserId,
            p_spot_id: spotId,
            p_text_content: textContent,
            p_image_urls: imageUrls,
            p_locale: locale,
            p_context: {
              ...sourceContext,
              source_surface: sourceSurface,
            },
          },
        );

      if (contentItemError) {
        throw contentItemError;
      }

      const contentItemId =
        contentItemResult?.content_item_id ??
        contentItemResult?.id;

      if (!contentItemId) {
        throw new Error("content_item_not_created");
      }

      const { data: reportResult, error: reportError } =
        await supabase.rpc("safety_submit_report_v1", {
          p_content_item_id: contentItemId,
          p_report_reason: reason,
          p_report_details: details.trim() || null,
          p_source_surface: sourceSurface,
          p_reporter_locale: locale,
          p_source_context: sourceContext,
        });

      if (reportError) {
        throw reportError;
      }

      const isDuplicate = Boolean(reportResult?.duplicate);
      setDuplicate(isDuplicate);
      setStep("success");

      onSubmitted?.({
        duplicate: isDuplicate,
        reportId: reportResult?.report_id,
        caseId: reportResult?.case_id,
      });
    } catch (error) {
      console.error("[ReportContentButton] submit failed", error);

      Alert.alert(
        "Meldung nicht gesendet",
        "Die Meldung konnte gerade nicht übermittelt werden. Bitte versuche es erneut.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Inhalt melden"
        disabled={disabled}
        onPress={open}
        style={({ pressed }) => [
          styles.trigger,
          !iconOnly && styles.triggerWithText,
          pressed && styles.triggerPressed,
          disabled && styles.triggerDisabled,
        ]}
      >
        <Ionicons
          name="flag-outline"
          size={iconOnly ? 20 : 18}
          color="#D6D6DC"
        />
        {!iconOnly ? (
          <Text style={styles.triggerText}>Melden</Text>
        ) : null}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={close} />

          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>SAFETY & INTEGRITY</Text>
                <Text style={styles.title}>
                  {step === "success"
                    ? "Danke für deine Meldung"
                    : step === "details"
                      ? selectedReason?.title ?? "Inhalt melden"
                      : "Warum möchtest du das melden?"}
                </Text>
                <Text style={styles.subtitle}>
                  {step === "success"
                    ? duplicate
                      ? "Du hast diesen Inhalt bereits gemeldet. Wir berücksichtigen deine bestehende Meldung."
                      : "Wir prüfen den Inhalt und treffen bei Bedarf eine Maßnahme."
                    : "Deine Meldung ist vertraulich. Die andere Person erfährt nicht, wer sie eingereicht hat."}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Schließen"
                onPress={close}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
              >
                <Ionicons name="close" size={22} color="#F7F7FA" />
              </Pressable>
            </View>

            {step === "reason" ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.reasonList}
                showsVerticalScrollIndicator={false}
              >
                {REASONS.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => {
                      setReason(item.value);
                      setStep("details");
                    }}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      pressed && styles.reasonRowPressed,
                    ]}
                  >
                    <View style={styles.reasonIcon}>
                      <Ionicons
                        name={item.icon}
                        size={21}
                        color="#F7F7FA"
                      />
                    </View>

                    <View style={styles.reasonCopy}>
                      <Text style={styles.reasonTitle}>
                        {item.title}
                      </Text>
                      <Text style={styles.reasonDescription}>
                        {item.description}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color="#74747D"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {step === "details" ? (
              <View style={styles.detailsContent}>
                <Pressable
                  onPress={() => setStep("reason")}
                  style={styles.backRow}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color="#FF4F91"
                  />
                  <Text style={styles.backText}>
                    Grund ändern
                  </Text>
                </Pressable>

                <View style={styles.previewCard}>
                  <Text style={styles.previewLabel}>
                    GEMELDETER INHALT
                  </Text>
                  <Text
                    numberOfLines={4}
                    style={styles.previewText}
                  >
                    {textContent?.trim() ||
                      "Dieser Inhalt enthält keinen Text."}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>
                  Möchtest du uns mehr dazu sagen?
                </Text>
                <Text style={styles.inputHint}>
                  Optional · maximal 2.000 Zeichen
                </Text>

                <TextInput
                  value={details}
                  onChangeText={(value) =>
                    setDetails(value.slice(0, 2000))
                  }
                  multiline
                  textAlignVertical="top"
                  placeholder="Beschreibe kurz, was dir aufgefallen ist."
                  placeholderTextColor="#6E6E78"
                  editable={!submitting}
                  style={styles.input}
                />

                <Text style={styles.counter}>
                  {details.length}/2000
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={submitReport}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.submitButton,
                    pressed && styles.submitButtonPressed,
                    submitting && styles.submitButtonDisabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="flag"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.submitButtonText}>
                        Meldung absenden
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}

            {step === "success" ? (
              <View style={styles.successContent}>
                <View style={styles.successIcon}>
                  <Ionicons
                    name={duplicate ? "checkmark" : "shield-checkmark"}
                    size={34}
                    color="#FFFFFF"
                  />
                </View>

                <Text style={styles.successTitle}>
                  {duplicate
                    ? "Meldung bereits vorhanden"
                    : "Meldung übermittelt"}
                </Text>

                <Text style={styles.successText}>
                  {duplicate
                    ? "Du musst nichts weiter tun. Deine bestehende Meldung bleibt in unserer Prüfung."
                    : "Unser Safety-Team kann den Inhalt nun in der Moderationskonsole prüfen."}
                </Text>

                <Pressable
                  onPress={close}
                  style={({ pressed }) => [
                    styles.doneButton,
                    pressed && styles.submitButtonPressed,
                  ]}
                >
                  <Text style={styles.doneButtonText}>Fertig</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerWithText: {
    width: "auto",
    height: 40,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  triggerPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.97 }],
  },
  triggerDisabled: {
    opacity: 0.35,
  },
  triggerText: {
    color: "#D6D6DC",
    fontSize: 14,
    fontWeight: "700",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    maxHeight: "91%",
    minHeight: 430,
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
    marginBottom: 2,
    backgroundColor: "#3A3A40",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: "#FF4F91",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  title: {
    color: "#F8F8FA",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "#9A9AA3",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 520,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  closeButtonPressed: {
    opacity: 0.65,
  },
  scroll: {
    flexGrow: 0,
  },
  reasonList: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  reasonRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  reasonRowPressed: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 14,
  },
  reasonIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  reasonCopy: {
    flex: 1,
  },
  reasonTitle: {
    color: "#F4F4F7",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  reasonDescription: {
    color: "#8F8F98",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  detailsContent: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 30,
  },
  backRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 17,
  },
  backText: {
    color: "#FF4F91",
    fontSize: 14,
    fontWeight: "700",
  },
  previewCard: {
    padding: 16,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
    marginBottom: 22,
  },
  previewLabel: {
    color: "#777780",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  previewText: {
    color: "#E8E8EC",
    fontSize: 15,
    lineHeight: 22,
  },
  inputLabel: {
    color: "#F4F4F7",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  inputHint: {
    color: "#83838C",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  input: {
    minHeight: 130,
    maxHeight: 210,
    marginTop: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.035)",
    color: "#F6F6F8",
    fontSize: 15,
    lineHeight: 21,
  },
  counter: {
    alignSelf: "flex-end",
    color: "#6E6E77",
    fontSize: 11,
    marginTop: 6,
  },
  submitButton: {
    minHeight: 54,
    marginTop: 18,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#E93678",
  },
  submitButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  successContent: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 42,
    paddingBottom: 34,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E93678",
    marginBottom: 20,
  },
  successTitle: {
    color: "#F8F8FA",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  successText: {
    color: "#96969F",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
    maxWidth: 390,
  },
  doneButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 28,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E93678",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
