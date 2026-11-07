"use client";

import { useEffect, useState } from "react";
import { parseWeatherContext, weatherSummary, weatherUpdatedLabel, type WeatherContext as WeatherData } from "../../../packages/shared/src/weather-context";
import { supabase } from "@/lib/supabase/client";

export function WeatherContext({ city }: { city: string }) {
  const [actor, setActor] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ city: string; actor: string; data: WeatherData | null; pending: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => { if (live) setActor(data.session?.user.id ?? null); }).catch(() => { if (live) setActor(null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setActor(session?.user.id ?? null));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function load() {
      if (cancelled || document.visibilityState === "hidden") return;
      if (timer) clearTimeout(timer);
      controller?.abort(); const requestController = new AbortController(); controller = requestController;
      setEntry({ city, actor: actor!, data: null, pending: true }); setLogoFailed(false);
      try {
        const { data, error } = await supabase.functions.invoke("weather-context", { body: { city }, signal: requestController.signal, timeout: 8_000 });
        if (cancelled || requestController.signal.aborted) return;
        const weather = error ? null : parseWeatherContext(data, city);
        setEntry({ city, actor: actor!, data: weather, pending: false });
        if (weather) timer = setTimeout(() => void load(), Math.max(1000, Date.parse(weather.validUntil) - Date.now()));
      } catch { if (!cancelled && !requestController.signal.aborted) setEntry({ city, actor: actor!, data: null, pending: false }); }
    }
    const visibility = () => { if (document.visibilityState === "visible") void load(); else { controller?.abort(); if (timer) clearTimeout(timer); } };
    void load(); document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; controller?.abort(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [city, actor, retry]);
  if (!actor) return null;
  const current = entry?.city === city && entry.actor === actor ? entry : null;
  const weather = current?.data ? parseWeatherContext(current.data, city) : null;
  return <div aria-label={`Wetter in ${city}`} style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--b-border, #333)", maxWidth: 620 }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
      <span className="b-muted">Wetter in {city}</span>
      {!current?.pending ? <button type="button" aria-label="Wetter aktualisieren" onClick={() => setRetry(x => x + 1)} style={{ minHeight: 44, background: "none", border: 0, color: "inherit", cursor: "pointer" }}>Aktualisieren</button> : null}
    </div>
    <p>{!current || current.pending ? "Wetter wird geladen …" : weather && !logoFailed ? weatherSummary(weather) : "Wetter gerade nicht verfügbar"}</p>
    {weather && !logoFailed ? <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><small className="b-muted">{weatherUpdatedLabel(weather)}</small>
      <a href={weather.attribution.legalUrl} target="_blank" rel="noreferrer" aria-label="Apple Weather: Datenquellen ansehen" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>
        {/* Apple's attribution asset must remain the provider's original logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={weather.attribution.logoUrl} alt="Apple Weather" width={100} height={22} style={{ objectFit: "contain" }} onError={() => setLogoFailed(true)} />
      </a></div> : null}
  </div>;
}
