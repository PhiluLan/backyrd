import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

type Suggestion = { concept_key: string; label: string; matched_expression: string };

export function MoodExpressionInput({ label, value, onChangeText, placeholder }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("backyrd_search_mood_concepts_v1", {
        p_query: value, p_locale: "de", p_limit: 6,
      });
      if (active) setSuggestions((data as Suggestion[] | null) ?? []);
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [value]);
  return <View>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.34)"
      maxLength={40} autoCorrect style={styles.input} />
    {value.trim() && suggestions.length ? <View style={styles.suggestions}>
      {suggestions.slice(0, 4).map((item) => <Pressable key={item.concept_key}
        accessibilityRole="button" onPress={() => { onChangeText(item.label); setSuggestions([]); }}
        style={styles.suggestion}><Text style={styles.suggestionText}>{item.label}</Text></Pressable>)}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  label: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 14 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "#111113", color: "#fff", paddingHorizontal: 14 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 9 },
  suggestion: { minHeight: 40, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 13 },
  suggestionText: { color: "#FFC5DA", fontWeight: "700" },
});
