"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { accountAuthError, isAccountEmail, isConfirmationCode, normalizeAccountEmail, normalizeConfirmationCode } from "@backyrd/shared";
import { supabase } from "@/lib/supabase/client";
import { Button } from "./ui";

export function VerifyEmailForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const pending = useRef(false);
  const lastAutomaticAttempt = useRef("");
  const resendAfter = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((resendAfter.current - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function verify(value = code) {
    if (pending.current) return;
    if (!isAccountEmail(email) || !isConfirmationCode(value)) {
      setError("Gib bitte eine gültige E-Mail-Adresse und den sechsstelligen Code ein.");
      return;
    }
    pending.current = true;
    setBusy("verify"); setError(null); setMessage(null);
    try {
      const { data, error: authError } = await supabase.auth.verifyOtp({ email: normalizeAccountEmail(email), token: normalizeConfirmationCode(value), type: "signup" });
      if (authError) throw authError;
      if (!data.session) throw new Error("auth_session_missing");
      window.location.replace("/onboarding");
    } catch (cause: unknown) {
      setError(accountAuthError(cause, "Der Code konnte nicht bestätigt werden. Prüfe ihn oder fordere einen neuen Code an."));
    } finally { pending.current = false; setBusy(null); }
  }

  function changeCode(value: string) {
    const normalized = normalizeConfirmationCode(value);
    setCode(normalized); setError(null);
    const attempt = `${normalizeAccountEmail(email)}:${normalized}`;
    if (isAccountEmail(email) && isConfirmationCode(normalized) && lastAutomaticAttempt.current !== attempt) {
      lastAutomaticAttempt.current = attempt;
      void verify(normalized);
    }
  }

  async function resend() {
    if (pending.current || Date.now() < resendAfter.current) return;
    if (!isAccountEmail(email)) { setError("Gib bitte zuerst deine gültige E-Mail-Adresse ein."); return; }
    pending.current = true; setBusy("resend"); setError(null); setMessage(null);
    resendAfter.current = Date.now() + 60_000; setRemaining(60);
    try {
      const { error: authError } = await supabase.auth.resend({ type: "signup", email: normalizeAccountEmail(email), options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` } });
      if (authError) throw authError;
      setCode(""); lastAutomaticAttempt.current = "";
      setMessage("Falls für diese Adresse eine Bestätigung offen ist, wurde eine neue E-Mail angefordert. Prüfe auch deinen Spam-Ordner.");
    } catch (cause: unknown) {
      setError(accountAuthError(cause, "Ein neuer Code konnte gerade nicht angefordert werden. Bitte versuche es später erneut."));
    } finally { pending.current = false; setBusy(null); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void verify(); }
  return <div className="b-narrow b-main"><section className="b-surface" style={{ padding: "clamp(22px,4vw,42px)" }}>
    <p className="b-kicker">E-Mail bestätigen</p>
    <h1 className="b-display b-page-title">Nur noch ein Schritt.</h1>
    <p className="b-muted">Gib den sechsstelligen Code aus deiner E-Mail ein. Du kannst ihn auch vollständig einfügen. Falls deine E-Mail einen Bestätigungslink enthält, kannst du diesen verwenden.</p>
    <form className="b-form" onSubmit={submit} aria-busy={busy !== null}>
      <div className="b-input-group"><label className="b-label" htmlFor="verify-email">E-Mail</label><input id="verify-email" className="b-input" type="email" autoComplete="email" value={email} disabled={busy !== null} onChange={(event) => { setEmail(event.target.value); setCode(""); setError(null); }} required /></div>
      <div className="b-input-group"><label className="b-label" htmlFor="verify-code">Bestätigungscode</label><input id="verify-code" className="b-input" inputMode="numeric" autoComplete="one-time-code" value={code} disabled={busy !== null} onChange={(event) => changeCode(event.target.value)} aria-describedby="verify-help" required /><p id="verify-help" className="b-meta">Der vollständige Code wird automatisch geprüft. Bei einem Fehler kannst du ihn korrigieren oder erneut bestätigen.</p></div>
      {error ? <p className="b-field-error" role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <Button type="submit" disabled={busy !== null}>{busy === "verify" ? "Wird bestätigt …" : "E-Mail bestätigen"}</Button>
      <Button type="button" variant="secondary" disabled={busy !== null || remaining > 0} onClick={() => void resend()}>{busy === "resend" ? "Wird angefordert …" : remaining > 0 ? `Neuer Code in ${remaining} s` : "Code erneut anfordern"}</Button>
    </form>
    <p className="b-meta"><Link href="/login">Schon bestätigt? Zur Anmeldung</Link></p>
  </section></div>;
}
