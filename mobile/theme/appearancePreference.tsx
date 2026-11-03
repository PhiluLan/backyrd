import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, Platform } from "react-native";

export type AndroidAppearancePreference = "system" | "light" | "dark";

const STORAGE_KEY = "backyrd.androidAppearance.v1";

type AppearancePreferenceContextValue = {
  preference: AndroidAppearancePreference;
  setPreference: (next: AndroidAppearancePreference) => Promise<void>;
};

const AppearancePreferenceContext = createContext<AppearancePreferenceContextValue | null>(null);

function parsePreference(value: string | null): AndroidAppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function AppearancePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setCurrentPreference] = useState<AndroidAppearancePreference>("system");
  const [ready, setReady] = useState(Platform.OS !== "android");

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (!active) return;
        const restored = parsePreference(value);
        Appearance.setColorScheme(restored === "system" ? null : restored);
        setCurrentPreference(restored);
      })
      .catch(() => {
        if (active) Appearance.setColorScheme(null);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  const setPreference = useCallback(async (next: AndroidAppearancePreference) => {
    if (Platform.OS !== "android") return;
    Appearance.setColorScheme(next === "system" ? null : next);
    setCurrentPreference(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference still applies for this session when local storage is unavailable.
    }
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <AppearancePreferenceContext.Provider value={value}>{ready ? children : null}</AppearancePreferenceContext.Provider>;
}

export function useAndroidAppearancePreference(): AppearancePreferenceContextValue {
  const value = useContext(AppearancePreferenceContext);
  if (!value) throw new Error("AppearancePreferenceProvider is missing");
  return value;
}
