import { ActivityIndicator, View } from "react-native";
import { BookingScreen } from "../../components/booking/BookingScreen";
import { useAuth } from "../../hooks/useAuth";
import { backyrdTheme as theme } from "../../theme/backyrd";

export default function BookingTab() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.color.background, justifyContent: "center" }}><ActivityIndicator accessibilityLabel="Anmeldung wird geprüft" color={theme.color.pink} /></View>;
  return <BookingScreen key={user?.id ?? "guest"} actorId={user?.id ?? null} />;
}
