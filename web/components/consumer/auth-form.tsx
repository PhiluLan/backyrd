"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "./ui";
import { accountAuthError, isAccountEmail, registrationOutcome, safeAccountReturnPath } from "@backyrd/shared";

type Mode = "login" | "signup" | "forgot" | "reset";
function human(error: unknown, mode: Mode) {
  return accountAuthError(error, mode === "login"
    ? "Die Anmeldung hat gerade nicht funktioniert. Bitte versuche es erneut."
    : "Die Anfrage konnte gerade nicht abgeschlossen werden. Bitte versuche es erneut.");
}
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = useMemo(() => safeAccountReturnPath(params.get("next")), [params]);
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetReady, setResetReady] = useState(mode !== "reset");
  const [checkingReset, setCheckingReset] = useState(mode === "reset");
  const pending = useRef(false);
  useEffect(() => {
    if (mode !== "reset") return;
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      setResetReady(!authError && Boolean(data.user));
      if (authError || !data.user) setError("Dein Link ist abgelaufen oder fehlt. Fordere bitte einen neuen Link an.");
    }).catch(() => { if (active) setError("Deine Anmeldung konnte nicht geprüft werden. Prüfe deine Verbindung und öffne den Link erneut."); })
      .finally(() => { if (active) setCheckingReset(false); });
    return () => { active = false; };
  }, [mode]);
  const redirecting = useRef(false);
  const loginAttempted = useRef(false);
  useEffect(() => {
    if (params.get("status") === "password-updated") setSuccess("Dein Passwort ist gespeichert. Melde dich jetzt damit an.");
    if (params.get("status") === "invalid") {
      setError("Der sichere Link ist abgelaufen, wurde bereits verwendet oder ist unvollständig. Fordere bitte einen neuen Link an.");
    }
  }, [params]);
  useEffect(() => {
    if (mode !== "login" || next !== "/owner") return;
    let active = true;
    // Owner entry can open the login route with a session that is already
    // stored in the browser. That is not a new SIGNED_IN event.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || error || !data.session || redirecting.current) return;
      redirecting.current = true;
      window.location.replace("/owner");
    });
    return () => { active = false; };
  }, [mode, next]);
  useEffect(() => {
    if (mode !== "login") return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Session events also fire when a page loads or regains focus. Only the
      // sign-in initiated by this form may navigate, or a redirect loop can
      // form when a private route sends the visitor back to login.
      if (!loginAttempted.current || !session || event !== "SIGNED_IN") return;
      // The session can be saved before signInWithPassword returns. Navigate
      // outside the auth callback/lock so a slow subscriber cannot strand us.
      window.setTimeout(() => {
        if (!active || redirecting.current) return;
        redirecting.current = true;
        window.location.replace(next);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [mode, next]);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || (mode === "reset" && !resetReady)) return;
    setError(null);
    setSuccess(null);
    const cleanEmail = email.trim().toLowerCase();
    if (mode !== "reset" && !isAccountEmail(cleanEmail)) {
      setError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }
    if (
      (mode === "signup" || mode === "reset") &&
      password.length < 8
    ) {
      setError("Das Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    if (mode === "login" && !password) { setError("Bitte gib dein Passwort ein."); return; }
    if ((mode === "signup" || mode === "reset") && password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (mode === "login") {
        loginAttempted.current = true;
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        if (!data.session) throw new Error("auth_session_missing");
        // A full navigation makes the newly written Supabase cookie visible to
        // Server Components, middleware and the client shell in one request.
        if (!redirecting.current) {
          redirecting.current = true;
          window.location.replace(next);
        }
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
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
        if (data.session) { window.location.replace("/onboarding"); return; }
        const outcome = registrationOutcome(data);
        if (outcome === "confirmation_requested") router.replace(`/verify?email=${encodeURIComponent(cleanEmail)}`);
        else if (outcome === "not_created" || error) setSuccess("Für diese E-Mail wurde kein neuer Account angelegt. Melde dich mit deinem bestehenden Zugang an oder fordere ein neues Passwort an.");
        else setError("Die Kontoerstellung konnte noch nicht bestätigt werden. Prüfe dein Postfach oder versuche es erneut.");
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
        setPassword(""); setConfirm(""); setResetReady(false);
        setSuccess("Dein Passwort ist gespeichert. Melde dich jetzt damit an.");
        try {
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          if (signOutError) throw signOutError;
          window.location.replace("/login?status=password-updated");
        } catch { setSuccess("Dein Passwort ist gespeichert. Deine Abmeldung konnte noch nicht bestätigt werden. Gehe zur Anmeldung, um dich mit deinem neuen Passwort anzumelden."); }
      }
    } catch (err) {
      if (mode === "login") loginAttempted.current = false;
      setError(human(err, mode));
    } finally {
      pending.current = false;
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
          <form className="b-form" onSubmit={submit} aria-busy={busy} style={{ marginTop: 30 }}>
            {mode !== "reset" ? (
              <div className="b-input-group">
                <label className="b-label" htmlFor="auth-email">
                  E-Mail
                </label>
                <input
                  id="auth-email"
                  className="b-input"
                  disabled={busy}
                  type="email"
                  autoComplete={mode === "login" ? "username" : "email"}
                  name="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="du@example.ch"
                />
              </div>
            ) : null}
            {mode !== "forgot" && (mode !== "reset" || resetReady) ? (
              <div className="b-input-group">
                <label className="b-label" htmlFor="auth-password">
                  Passwort
                </label>
                <input
                  id="auth-password"
                  name="password"
                  className="b-input"
                  disabled={busy}
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
            {mode === "signup" || (mode === "reset" && resetReady) ? (
              <div className="b-input-group">
                <label className="b-label" htmlFor="auth-confirm">
                  Passwort bestätigen
                </label>
                <input
                  id="auth-confirm"
                  name="confirm"
                  className="b-input"
                  disabled={busy}
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
                {mode === "login" ? <> <Link href={`/verify?email=${encodeURIComponent(email.trim())}`}>E-Mail bestätigen</Link></> : null}
              </p>
            ) : null}
            {success ? (
              <p style={{ color: "var(--green)" }} role="status">
                {success}
              </p>
            ) : null}
            {slow ? (
              <div role="status">
                <p className="b-muted">Die Anfrage dauert länger als üblich. Prüfe bitte deine Verbindung. Du kannst die Seite neu laden und es erneut versuchen.</p>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Seite neu laden
                </Button>
              </div>
            ) : null}
            {checkingReset ? <p role="status">Dein sicherer Link wird geprüft …</p> : null}
            {mode === "reset" && !resetReady && !checkingReset && !success ? <Link href="/forgot-password">Neuen Link anfordern</Link> : null}
            <Button type="submit" disabled={busy || (mode === "reset" && !resetReady)}>
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
              </Link> · <Link href="/forgot-password">Passwort vergessen?</Link>
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
