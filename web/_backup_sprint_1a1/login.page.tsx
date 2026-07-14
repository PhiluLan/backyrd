"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Mode = "login" | "signup";

function safeNext(value: string | null) {
  if (!value) return "/owner";
  if (!value.startsWith("/")) return "/owner";
  if (value.startsWith("//")) return "/owner";
  return value;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      setCurrentEmail(session?.user.email ?? null);
      setLoadingSession(false);
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentEmail(session?.user.email ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    setError(null);
    setSuccess(null);

    if (!cleanEmail || !cleanPassword) {
      setError("Bitte gib E-Mail und Passwort ein.");
      return;
    }

    if (mode === "signup" && cleanPassword.length < 8) {
      setError("Bitte gib für die Registrierung ein Passwort mit mindestens 8 Zeichen ein.");
      return;
    }

    try {
      setBusy(true);

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        if (error) throw error;

        router.replace(nextPath);
        router.refresh();
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          emailRedirectTo: `${origin}${nextPath}`,
        },
      });

      if (error) throw error;

      setSuccess(
        "Account erstellt. Falls E-Mail-Bestätigung aktiv ist, prüfe bitte dein Postfach. Danach kannst du dich einloggen."
      );
      setMode("login");
    } catch (err: any) {
      setError(err?.message ?? "Login fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setCurrentEmail(null);
    setSuccess("Du bist ausgeloggt.");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <header className="border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Backyrd
          </Link>

          <nav className="flex items-center gap-6">
            <Link href="/" className="text-sm text-white/65 transition hover:text-white">
              Discover
            </Link>
            <Link href="/owner" className="text-sm text-white/65 transition hover:text-white">
              Owner
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">
            Backyrd Auth
          </div>

          <h1 className="mt-8 max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">
            Login für dein Backyrd Owner Dashboard.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-white/55">
            Melde dich ein und pflege deine Spots, damit Backyrd besser versteht,
            wann dein Betrieb wirklich perfekt passt.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {["Spot bearbeiten", "Ranking verbessern", "Backyrd Intelligence", "Owner Updates"].map(
              (chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/65"
                >
                  {chip}
                </span>
              )
            )}
          </div>

          <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="text-sm font-semibold text-white/70">Aktueller Status</div>
            <div className="mt-3 text-white/50">
              {loadingSession
                ? "Session wird geprüft…"
                : currentEmail
                  ? `Eingeloggt als ${currentEmail}`
                  : "Aktuell nicht eingeloggt"}
            </div>
          </div>
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold">
                  {mode === "login" ? "Willkommen zurück" : "Account erstellen"}
                </h2>
                <p className="mt-4 leading-7 text-white/50">
                  {mode === "login"
                    ? "Melde dich an und springe direkt ins Owner Dashboard."
                    : "Erstelle einen Account für den Owner-Bereich."}
                </p>
              </div>

              <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setSuccess(null);
                  }}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === "login" ? "bg-white text-black" : "text-white/50 hover:text-white",
                  ].join(" ")}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setSuccess(null);
                  }}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === "signup" ? "bg-white text-black" : "text-white/50 hover:text-white",
                  ].join(" ")}
                >
                  Signup
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-semibold text-white/55">E-Mail</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="du@backyrd.app"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-white/55">Passwort</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "Dein Passwort" : "Mindestens 8 Zeichen"}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
                />
              </label>

              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-2xl bg-white px-5 py-4 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy
                  ? "Bitte warten…"
                  : mode === "login"
                    ? "Einloggen"
                    : "Account erstellen"}
              </button>
            </form>

            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/30">
                Konto
              </div>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-3">
              <Link
                href="/owner"
                className="block rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center font-semibold text-white/85 transition hover:bg-white/10"
              >
                Zum Owner Dashboard
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-semibold text-white/85 transition hover:bg-red-500/10 hover:text-red-100"
              >
                Logout
              </button>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-red-100/80">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-100/80">
                {success}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#050506]" />}>
      <LoginContent />
    </Suspense>
  );
}
