"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // nach Login ins Admin-Dashboard
    router.push("/admin");
  }

  return (
    <>
      <div className="login-root">
        <div className="login-card">
          <h1 className="login-title">Backyrd Admin</h1>
          <p className="login-subtitle">Logge dich mit deinem Admin-Account ein.</p>

          {error && <p className="login-error">{error}</p>}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-label">E-Mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                placeholder="you@example.com"
              />
            </div>

            <div className="login-field">
              <label className="login-label">Passwort</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" disabled={loading} className="login-button">
              {loading ? "Einloggen…" : "Login"}
            </button>
          </form>
        </div>
      </div>

      <style jsx>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--background);
          color: var(--foreground);
        }

        .login-card {
          background: var(--panel);
          border-radius: 16px;
          padding: 2rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .login-title {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 600;
        }

        .login-subtitle {
          margin: 0.25rem 0 1.5rem;
          font-size: 0.9rem;
          color: var(--muted);
        }

        .login-error {
          margin-bottom: 1rem;
          font-size: 0.85rem;
          color: #ff6b6b;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .login-label {
          font-size: 0.85rem;
          font-weight: 500;
        }

        .login-input {
          background: #1a1a1a;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 0.65rem 0.75rem;
          font-size: 0.9rem;
          color: var(--foreground);
        }

        .login-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .login-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.4);
        }

        .login-button {
          margin-top: 0.5rem;
          width: 100%;
          padding: 0.7rem 1rem;
          border-radius: 999px;
          border: none;
          background: var(--accent);
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.95rem;
          transition: background 0.15s ease, transform 0.05s ease;
        }

        .login-button:hover {
          background: #0284c7;
          transform: translateY(-1px);
        }

        .login-button:active {
          transform: translateY(0);
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: default;
        }
      `}</style>
    </>
  );
}
