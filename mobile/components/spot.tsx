// mobile/components/spot.tsx
import React from "react";
import { View, Text, Pressable } from "react-native";
import { getPillStyle } from "../lib/moods";

export function Section({
  title,
  actionLabel,
  onActionPress,
  children,
}: {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#000" }}>{title}</Text>
        {actionLabel ? (
          <Pressable
            onPress={onActionPress}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "#F4E8E3",
            }}
          >
            <Text style={{ color: "#000", fontWeight: "700" }}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function KeyValueRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  if (!value) return null;
  const Cmp = onPress ? Pressable : View;
  return (
    <Cmp
      {...(onPress ? { onPress } : {})}
      style={{
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#EEE",
      }}
    >
      <Text style={{ color: "#666", marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: "#000", fontWeight: "500" }}>{value}</Text>
    </Cmp>
  );
}

export function PillGroup({ children }: { children?: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

export function MoodPill({ label, count, variant = "filled", selected = false, onPress }: any) {
  const isOutline = variant === "outline";
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#fff",
        backgroundColor: isOutline ? "transparent" : "#fff",
      }}
    >
      <Text style={{ color: isOutline ? "#fff" : "#000", fontWeight: "600" }}>
        {label} {count ? `(${count})` : ""}
      </Text>
    </Pressable>
  );
}
