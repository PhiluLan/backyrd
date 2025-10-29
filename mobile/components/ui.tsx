import { ReactNode } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../lib/theme";

// 🧭 Screen-Komponente mit SafeArea + Padding + optional Scroll
export function Screen({
  children,
  scroll = false,
  safe = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  safe?: boolean;
  style?: object;
}) {
  const Container = scroll ? ScrollView : View;

  const content = (
    <Container
      contentContainerStyle={
        scroll
          ? {
              paddingHorizontal: theme.spacing.md,
              paddingBottom: theme.spacing.xl,
            }
          : undefined
      }
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingHorizontal: scroll ? 0 : theme.spacing.md,
        },
        style,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </Container>
  );

  if (safe) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        edges={["top", "left", "right"]}
      >
        {content}
      </SafeAreaView>
    );
  }

  return <>{content}</>;
}

// Optional: kann für extra vertikale Struktur genutzt werden
export function Container({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        gap: theme.spacing.md,
        paddingTop: theme.spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...theme.typography.h1,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

export function Subtitle({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...theme.typography.small,
        color: theme.colors.text.secondary,
      }}
    >
      {children}
    </Text>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={theme.colors.text.muted}
      {...props}
      style={[
        {
          backgroundColor: "#141417",
          color: theme.colors.text.primary,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        props.style,
      ]}
    />
  );
}

export function Button({
  title,
  onPress,
  style,
  textStyle,
}: {
  title: string;
  onPress?: () => void;
  style?: any;
  textStyle?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#18A76D", // Default-Farbe
        },
        style,
      ]}
    >
      <Text
        style={[
          { color: "#0B0B0C", fontWeight: "800" },
          textStyle,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing.sm,
        flexWrap: "wrap",
      }}
    >
      {children}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "#141417",
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.md,
      }}
    >
      {children}
    </View>
  );
}

export function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: theme.spacing.sm,
      }}
    />
  );
}
