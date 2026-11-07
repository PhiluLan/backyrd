import React, { useCallback, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { parseWeatherContext, weatherSummary, weatherUpdatedLabel, type WeatherContext as WeatherData } from "../../packages/shared/src/weather-context";
import { AppText } from "./foundation/AppText";
import { supabase } from "../lib/supabase";
import { backyrdTheme as theme } from "../theme/backyrd";

export function WeatherContext({ city, actorId, revision }: { city: string; actorId: string; revision: number }) {
  const [entry, setEntry] = useState<{ city: string; actorId: string; data: WeatherData | null; pending: boolean } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function load() {
      if (cancelled || AppState.currentState !== "active") return;
      if (timer) clearTimeout(timer);
      controller?.abort(); const requestController = new AbortController(); controller = requestController;
      setEntry({ city, actorId, data: null, pending: true }); setLogoFailed(false);
      try {
        const { data, error } = await supabase.functions.invoke("weather-context", { body: { city }, signal: requestController.signal, timeout: 8_000 });
        if (cancelled || requestController.signal.aborted) return;
        const weather = error ? null : parseWeatherContext(data, city);
        setEntry({ city, actorId, data: weather, pending: false });
        if (weather) timer = setTimeout(() => void load(), Math.max(1000, Date.parse(weather.validUntil) - Date.now()));
      } catch { if (!cancelled && !requestController.signal.aborted) setEntry({ city, actorId, data: null, pending: false }); }
    }
    void load();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void load(); else { controller?.abort(); if (timer) clearTimeout(timer); } });
    return () => { cancelled = true; controller?.abort(); if (timer) clearTimeout(timer); listener.remove(); };
  }, [city, actorId, revision, retry]));
  const current = entry?.city === city && entry.actorId === actorId ? entry : null;
  const weather = current?.data ? parseWeatherContext(current.data, city) : null;
  return <View style={styles.root}>
    <View style={styles.heading}><AppText role="meta" tone="secondary">Wetter in {city}</AppText>
      {!current?.pending ? <Pressable accessibilityRole="button" accessibilityLabel="Wetter aktualisieren" onPress={() => setRetry(x => x + 1)} style={styles.action}><AppText role="caption" tone="secondary">Aktualisieren</AppText></Pressable> : null}</View>
    <AppText role="body">{current?.pending || !current ? "Wetter wird geladen …" : weather && !logoFailed ? weatherSummary(weather) : "Wetter gerade nicht verfügbar"}</AppText>
    {weather && !logoFailed ? <View style={styles.source}><AppText role="caption" tone="secondary">{weatherUpdatedLabel(weather)}</AppText>
      <Pressable accessibilityRole="link" accessibilityLabel="Apple Weather: Datenquellen ansehen" onPress={() => void Linking.openURL(weather.attribution.legalUrl).catch(() => undefined)} style={styles.action}>
        <Image source={{ uri: weather.attribution.logoUrl }} contentFit="contain" style={styles.logo} onError={() => setLogoFailed(true)} accessibilityLabel="Apple Weather" />
      </Pressable></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.md, paddingVertical: 12, gap: 4, borderTopWidth: 1, borderColor: theme.color.border },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  source: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  action: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  logo: { width: 80, height: 18 },
});
