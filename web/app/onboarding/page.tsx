"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { supabase } from "@/lib/supabase/client";
import { isAccountUsername, parseAccountAge, suggestAccountUsername } from "@backyrd/shared";
import { Button, StateView } from "@/components/consumer/ui";
export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("Basel");
  const [country, setCountry] = useState("Schweiz");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState("");
  const { allowLeave } = useUnsavedChanges(Boolean(baseline) && JSON.stringify([name, username, age, city, country]) !== baseline);
  const pending = useRef(false);
  const usernameEdited = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) { router.replace("/login?next=/onboarding"); return; }
      const { data, error: profileError } = await supabase.from("profiles")
        .select("display_name,first_name,username,birthdate,city,home_city,country")
        .eq("id", auth.user.id).single();
      if (profileError || !data) throw profileError ?? new Error("profile_missing");
      const displayName = data.display_name ?? data.first_name ?? "";
      setName(displayName);
      setUsername(data.username ?? suggestAccountUsername(displayName));
      usernameEdited.current = Boolean(data.username);
      setAge(data.birthdate ? String(new Date().getFullYear() - Number(data.birthdate.slice(0, 4))) : "");
      setCity(data.city ?? data.home_city ?? "Basel");
      setCountry(data.country ?? "Schweiz");
      setBaseline(JSON.stringify([displayName, data.username ?? suggestAccountUsername(displayName), data.birthdate ? String(new Date().getFullYear() - Number(data.birthdate.slice(0, 4))) : "", data.city ?? data.home_city ?? "Basel", data.country ?? "Schweiz"]));
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError(null);
    const cleanUser = username.trim().toLowerCase();
    const numeric = parseAccountAge(age);
    if (name.trim().length < 2 || name.trim().length > 60) { setError("Bitte gib einen Namen mit 2 bis 60 Zeichen ein."); return; }
    if (!isAccountUsername(cleanUser)) { setError("Dein Benutzername braucht 3 bis 24 Zeichen: Buchstaben ohne Umlaute, Zahlen, Punkt oder Unterstrich."); return; }
    if (numeric === null) { setError("Bitte gib dein Alter als ganze Zahl zwischen 13 und 120 ein."); return; }
    if (!city.trim() || !country.trim() || city.trim().length > 80 || country.trim().length > 80) { setError("Bitte gib Stadt und Land mit jeweils höchstens 80 Zeichen ein."); return; }
    pending.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "complete_profile_onboarding_v2",
        {
          p_display_name: name.trim(),
          p_username: cleanUser,
          p_age: numeric,
          p_city: city.trim(),
          p_country: country.trim(),
        },
      );
      if (error || !data || typeof data !== "object" || data.ok !== true)
        throw error ?? new Error();
      allowLeave();
      router.replace("/decision");
      router.refresh();
    } catch (err) {
      const message =
        err && typeof err === "object" && "code" in err && err.code === "23505"
          ? "Dieser Benutzername ist schon vergeben."
          : "Dein Profil konnte gerade nicht gespeichert werden.";
      setError(message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="b-narrow b-main">
        <StateView
          title="Profil wird vorbereitet"
          message="Einen kurzen Moment."
        />
      </div>
    );
  if (loadError) return <div className="b-narrow b-main"><StateView title="Profil nicht geladen" message="Deine bestehenden Angaben konnten nicht geladen werden. Bitte versuche es erneut, bevor du Änderungen machst." actionLabel="Erneut versuchen" onAction={() => void load()} /></div>;
  return (
    <div className="b-narrow b-main">
      <p className="b-kicker">1 von 2 · Dein Backyrd</p>
      <h1 className="b-display b-display-lg" style={{ marginTop: 12 }}>
        WILLKOMMEN BEI BACKYRD.
      </h1>
      <div className="b-marker" />
      <p className="b-muted">
        Kurz dein Profil anlegen. Danach kannst du deinen nächsten Moment bei
        Backyrd beschreiben.
      </p>
      <form
        className="b-form b-surface"
        onSubmit={submit}
        style={{ padding: "clamp(22px,4vw,42px)", marginTop: 30 }}
      >
        <fieldset className="b-form-fields" disabled={busy}><div className="b-form-row">
          <div className="b-input-group">
            <label className="b-label" htmlFor="ob-name">
              Öffentlicher Name
            </label>
            <input
              id="ob-name"
              className="b-input"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!usernameEdited.current) setUsername(suggestAccountUsername(event.target.value));
              }}
              autoComplete="given-name"
              maxLength={60}
            />
          </div>
          <div className="b-input-group">
            <label className="b-label" htmlFor="ob-user">
              Benutzername
            </label>
            <input
              id="ob-user"
              className="b-input"
              value={username}
              onChange={(event) => { usernameEdited.current = true; setUsername(event.target.value); }}
              autoComplete="username"
              maxLength={24}
            />
          </div>
        </div>
        <div className="b-form-row">
          <div className="b-input-group">
            <label className="b-label" htmlFor="ob-age">
              Alter
            </label>
            <input
              id="ob-age"
              className="b-input"
              inputMode="numeric"
              value={age}
              onChange={(event) => setAge(event.target.value)}
            />
          </div>
          <div className="b-input-group">
            <label className="b-label" htmlFor="ob-city">
              Stadt
            </label>
            <input
              id="ob-city"
              className="b-input"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              autoComplete="address-level2"
            />
          </div>
        </div>
        <div className="b-input-group">
          <label className="b-label" htmlFor="ob-country">
            Land
          </label>
          <input
            id="ob-country"
            className="b-input"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            autoComplete="country-name"
          />
        </div>
        <p className="b-meta">Dein Alter wird nicht öffentlich angezeigt. Du kannst deine Stadt selbst eingeben; eine Standortfreigabe ist dafür nicht nötig.</p>
        </fieldset>
        {error ? (
          <p className="b-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Wird gespeichert …" : "Weiter"}
        </Button>
      </form>
    </div>
  );
}
