import { Redirect } from "expo-router";

// Preserve old deep links without retaining a second Decision screen or state.
export default function RetiredDecisionScreen() {
  return <Redirect href="/(tabs)/wohin" />;
}
