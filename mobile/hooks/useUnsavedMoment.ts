import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useEffect } from "react";
import { Alert, Platform } from "react-native";

/** Protect an intentional back gesture, without blocking place selection pushed on top. */
export function useUnsavedMoment(dirty: boolean, submitting: boolean) {
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => {
    if (submitting) { Alert.alert("Moment wird geteilt", "Bitte warte kurz, bis die Übertragung abgeschlossen ist."); return; }
    if (Platform.OS === "web") {
      if (window.confirm("Deinen ungeteilten Moment verwerfen?")) navigation.dispatch(data.action);
    } else Alert.alert("Moment verwerfen?", "Dein Foto und deine Eingaben wurden noch nicht geteilt.", [
      { text: "Weiter bearbeiten", style: "cancel" },
      { text: "Verwerfen", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
}
