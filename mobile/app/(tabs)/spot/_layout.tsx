// mobile/app/(tabs)/spot/_layout.tsx
import { Stack } from "expo-router";

export default function SpotLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: "#000",
        headerBackTitle: "Zurück",
        headerTitle: "", // kein Titel oben, Spotname kommt aus [id].tsx
      }}
    />
  );
}
