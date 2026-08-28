"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setError("Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div className="by-loginWrap">
      <div className="by-card by-loginCard">
        <div>
          <div className="by-h3">Backyrd Intelligence</div>
          <div className="by-muted by-small">Sicherer Zugang für Founder und Admin-Team</div>
        </div>

        <form onSubmit={onSubmit} className="by-stack" style={{ marginTop: 14 }}>
          <div className="by-field">
            <div className="by-fieldLabel">E-Mail</div>
            <input
              className="by-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@backyrd.ch"
              autoComplete="email"
            />
          </div>

          <div className="by-field">
            <div className="by-fieldLabel">Passwort</div>
            <input
              type="password"
              className="by-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error ? <div className="by-alert by-alertError">{error}</div> : null}

          <button
            disabled={loading || !email || !password}
            className="by-btn by-btn-accent"
            type="submit"
            style={{ width: "100%" }}
          >
            {loading ? "Anmeldung läuft …" : "Sicher anmelden"}
          </button>
        </form>

        <div className="by-muted by-xs" style={{ marginTop: 10 }}>
          Nur für autorisierte Backyrd-Accounts.
        </div>
      </div>
    </div>
  );
}
