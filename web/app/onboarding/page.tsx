"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
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
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login?next=/onboarding");
      setLoading(false);
    });
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const cleanUser = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "");
    const numeric = Number.parseInt(age, 10);
    if (
      name.trim().length < 2 ||
      cleanUser.length < 3 ||
      !Number.isFinite(numeric) ||
      numeric < 13 ||
      city.trim().length < 2
    ) {
      setError("Bitte fülle alle Angaben vollständig und gültig aus.");
      return;
    }
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
      router.replace("/decision");
      router.refresh();
    } catch (err) {
      const message =
        err && typeof err === "object" && "code" in err && err.code === "23505"
          ? "Dieser Benutzername ist schon vergeben."
          : "Dein Profil konnte gerade nicht gespeichert werden.";
      setError(message);
    } finally {
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
  return (
    <div className="b-narrow b-main">
      <p className="b-kicker">1 von 2 · Dein Backyrd</p>
      <h1 className="b-display b-display-lg" style={{ marginTop: 12 }}>
        WILLKOMMEN BEI BACKYRD.
      </h1>
      <div className="b-marker" />
      <p className="b-muted">
        Kurz dein Profil anlegen. Danach kannst du deinen ersten Moment für
        Decision beschreiben.
      </p>
      <form
        className="b-form b-surface"
        onSubmit={submit}
        style={{ padding: "clamp(22px,4vw,42px)", marginTop: 30 }}
      >
        <div className="b-form-row">
          <div className="b-input-group">
            <label className="b-label" htmlFor="ob-name">
              Name
            </label>
            <input
              id="ob-name"
              className="b-input"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!username)
                  setUsername(
                    event.target.value.toLowerCase().replace(/\s+/g, ""),
                  );
              }}
              autoComplete="name"
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
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
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
