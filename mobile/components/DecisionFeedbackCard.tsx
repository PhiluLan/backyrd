import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { AppText, ProductTextInput as TextInput } from "./foundation/AppText";
import { submitDecisionFeedback, type ProductFeedbackSentiment } from "../lib/productFeedback";

type FeedbackChoice = {
  sentiment: ProductFeedbackSentiment;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

const choices: FeedbackChoice[] = [
  { sentiment: "helpful", label: "Ja", icon: "thumbs-up-outline" },
  { sentiment: "almost", label: "Fast", icon: "options-outline" },
  { sentiment: "not_helpful", label: "Nein", icon: "thumbs-down-outline" },
];

export function DecisionFeedbackCard({ decisionId, color }: {
  decisionId: string;
  color: { card: string; border: string; text: string; muted: string; pink: string; tint: string };
}) {
  const [selected, setSelected] = useState<ProductFeedbackSentiment | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(sentiment: ProductFeedbackSentiment, detail?: string) {
    if (status === "sending" || status === "sent") return;
    setSelected(sentiment);
    setStatus("sending");
    try {
      await submitDecisionFeedback({ decisionId, sentiment, message: detail });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <View accessibilityLiveRegion="polite" style={[styles.thanks, { backgroundColor: color.tint, borderColor: color.border }]}>
        <Ionicons name="checkmark-circle" size={20} color={color.pink} />
        <AppText role="bodyStrong" style={{ color: color.text }}>Danke – das hilft uns wirklich.</AppText>
      </View>
    );
  }

  const wantsDetail = selected === "almost" || selected === "not_helpful";
  return (
    <View style={[styles.card, { backgroundColor: color.card, borderColor: color.border }]}>
      <AppText role="bodyStrong" style={{ color: color.text }}>Haben dir diese Vorschläge geholfen?</AppText>
      <AppText role="caption" style={{ color: color.muted }}>Ein kurzer Hinweis reicht – freiwillig und direkt bei dieser Suche.</AppText>
      <View style={styles.choices}>
        {choices.map(choice => {
          const active = selected === choice.sentiment;
          return (
            <Pressable
              key={choice.sentiment}
              accessibilityRole="button"
              accessibilityLabel={`${choice.label}, Feedback zur Decision`}
              accessibilityState={{ selected: active, disabled: status === "sending" }}
              disabled={status === "sending"}
              onPress={() => {
                if (choice.sentiment === "helpful") void send(choice.sentiment);
                else { setSelected(choice.sentiment); setStatus("idle"); }
              }}
              style={[styles.choice, { borderColor: active ? color.pink : color.border, backgroundColor: active ? color.tint : color.card }]}
            >
              <Ionicons name={choice.icon} size={18} color={active ? color.pink : color.muted} />
              <AppText role="label" style={{ color: active ? color.pink : color.text }}>{choice.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {wantsDetail ? (
        <View style={styles.detail}>
          <TextInput
            accessibilityLabel="Optionaler Hinweis zur Decision"
            value={message}
            onChangeText={setMessage}
            maxLength={1000}
            multiline
            placeholder="Was hätte besser passen sollen? (optional)"
            placeholderTextColor={color.muted}
            style={[styles.input, { color: color.text, borderColor: color.border, backgroundColor: color.tint }]}
          />
          <Pressable accessibilityRole="button" disabled={status === "sending"} onPress={() => selected && void send(selected, message)} style={[styles.send, { backgroundColor: color.pink }]}>
            {status === "sending" ? <ActivityIndicator color="#FFFFFF" /> : <AppText role="label" style={styles.sendLabel}>{message.trim() ? "Feedback senden" : "Ohne Kommentar senden"}</AppText>}
          </Pressable>
        </View>
      ) : null}
      {status === "error" ? <AppText accessibilityLiveRegion="polite" role="caption" tone="error">Das hat gerade nicht geklappt. Tippe zum erneuten Senden noch einmal auf den Button.</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 22, borderWidth: 1, borderRadius: 22, padding: 18, gap: 8 },
  choices: { flexDirection: "row", gap: 8, marginTop: 6 },
  choice: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  detail: { gap: 10, marginTop: 4 },
  input: { minHeight: 76, maxHeight: 130, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, textAlignVertical: "top" },
  send: { minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  sendLabel: { color: "#FFFFFF" },
  thanks: { marginTop: 22, minHeight: 58, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
});
