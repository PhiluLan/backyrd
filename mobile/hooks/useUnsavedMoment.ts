import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";

type DraftCopy = { title: string; message: string; webMessage: string; busyTitle: string; busyMessage: string };

/** Protect intentional back navigation without persisting private drafts on disk. */
export function useUnsavedDraft(dirty: boolean, submitting: boolean, copy: DraftCopy) {
  const navigation = useNavigation();
  const allowed = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    if (allowed.current) { navigation.dispatch(data.action); return; }
    if (submitting) { Alert.alert(copy.busyTitle, copy.busyMessage); return; }
    if (Platform.OS === "web") {
      if (window.confirm(copy.webMessage)) navigation.dispatch(data.action);
    } else Alert.alert(copy.title, copy.message, [
      { text: "Weiter bearbeiten", style: "cancel" },
      { text: "Verwerfen", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { if (!allowed.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  return { allowLeave: () => { allowed.current = true; } };
}

export function useUnsavedMoment(dirty: boolean, submitting: boolean) {
  useUnsavedDraft(dirty, submitting, {
    title: "Moment verwerfen?", message: "Dein Foto und deine Eingaben wurden noch nicht geteilt.",
    webMessage: "Deinen ungeteilten Moment verwerfen?", busyTitle: "Moment wird geteilt",
    busyMessage: "Bitte warte kurz, bis die Übertragung abgeschlossen ist.",
  });
}
