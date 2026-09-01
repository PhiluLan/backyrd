"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "./ui";

type Mode = "login" | "signup" | "forgot" | "reset";
function nextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
function human(error: unknown, mode: Mode) {
  const value = error instanceof Error ? error.message.toLowerCase() : "";
  if (value.includes("invalid login"))
    return "E-Mail oder Passwort stimmen nicht.";
  if (value.includes("password"))
    return "Das Passwort erfüllt die aktuellen Sicherheitsanforderungen nicht.";
  if (value.includes("rate"))
    return "Zu viele Versuche. Bitte warte einen Moment.";
  return mode === "login"
    ? "Die Anmeldung hat gerade nicht funktioniert."
    : "Die Anfrage konnte gerade nicht abgeschlossen werden.";
}
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = useMemo(() => nextPath(params.get("next")), [params]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    if (params.get("status") === "invalid") {
      setError("Der sichere Link ist abgelaufen, wurde bereits verwendet oder ist unvollständig. Fordere bitte einen neuen Link an.");
    }
  }, [params]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const cleanEmail = email.trim().toLowerCase();
    if (mode !== "reset" && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }
    if (
      (mode === "login" || mode === "signup" || mode === "reset") &&
      password.length < 8
    ) {
      setError("Das Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    if ((mode === "signup" || mode === "reset") && password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        if (!data.session) throw new Error("auth_session_missing");
        // A full navigation makes the newly written Supabase cookie visible to
        // Server Components, middleware and the client shell in one request.
        window.location.replace(next);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding`,
          },
        });
        if (error) {
          const detail = error.message.toLowerCase();
          if (!detail.includes("already registered") && !detail.includes("already been registered")) throw error;
        }
        router.replace(`/verify?email=${encodeURIComponent(cleanEmail)}`);
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
          },
        );
        if (error) throw error;
        setSuccess("Wenn ein Konto existiert, erhältst du gleich eine E-Mail.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setSuccess("Dein Passwort ist aktualisiert.");
        window.setTimeout(() => router.replace("/"), 1000);
      }
    } catch (err) {
      setError(human(err, mode));
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "login"
      ? "Willkommen zurück."
      : mode === "signup"
        ? "Dein Backyrd beginnt hier."
        : mode === "forgot"
          ? "Passwort vergessen?"
          : "Neues Passwort.";
  const copy =
    mode === "login"
      ? "Melde dich an und nutze Für jetzt, Momente und dein Profil im Web und in der App."
      : mode === "signup"
        ? "Ein Konto verbindet deine Entscheidungen, Orte und Momente – im Web und in der App."
        : mode === "forgot"
          ? "Wir schicken dir einen sicheren Link. Deine Daten und Einstellungen bleiben unverändert."
          : "Wähle ein neues, sicheres Passwort für dein Konto.";
  return (
    <div className="b-auth-shell">
      <section className="b-auth-panel">
        <div style={{ width: "min(100%,520px)", margin: "auto" }}>
          <p className="b-kicker">BACKYRD ACCOUNT</p>
          <h1 className="b-display b-page-title" style={{ marginTop: 12 }}>
            {title}
          </h1>
          <div className="b-marker" />
          <p className="b-muted">{copy}</p>
          <form className="b-form" onSubmit={submit} style={{ marginTop: 30 }}>
            {mode !== "reset" ? (
              <div className="b-input-group">
                <label className="b-label" htmlFor="auth-email">
                  E-Mail
                </label>
                <input
                  id="auth-email"
                  className="b-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="du@example.ch"
                />
              </div>
            ) : null}
            {mode !== "forgot" ? (
              <div className="b-input-group">
                <label className="b-label" htmlFor="auth-password">
                  Passwort
                </label>
                <input
                  id="auth-password"
                  className="b-input"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                />
              </div>
            ) : null}
            {mode === "signup" || mode === "reset" ? (
              <div className="b-input-group">
                <label className="b-label" htmlFor="auth-confirm">
                  Passwort bestätigen
                </label>
                <input
                  id="auth-confirm"
                  className="b-input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            ) : null}
            {error ? (
              <p className="b-field-error" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p style={{ color: "var(--green)" }} role="status">
                {success}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Einen Moment …"
                : mode === "login"
                  ? "Anmelden"
                  : mode === "signup"
                    ? "Konto erstellen"
                    : mode === "forgot"
                      ? "Link senden"
                      : "Passwort speichern"}
            </Button>
          </form>
          <div className="b-divider" style={{ margin: "28px 0" }} />
          {mode === "login" ? (
            <p className="b-meta">
              <Link href="/forgot-password">Passwort vergessen?</Link> · Noch
              kein Konto?{" "}
              <Link href={`/signup?next=${encodeURIComponent(next)}`}>
                Registrieren
              </Link>
            </p>
          ) : mode === "signup" ? (
            <p className="b-meta">
              Schon dabei?{" "}
              <Link href={`/login?next=${encodeURIComponent(next)}`}>
                Anmelden
              </Link>
            </p>
          ) : (
            <p className="b-meta">
              <Link href="/login">Zurück zur Anmeldung</Link>
            </p>
          )}
        </div>
      </section>
      <aside className="b-auth-art" aria-hidden="true" />
    </div>
  );
}
