"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";

type Mode = "login" | "signup";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    return [
      maybeError.message,
      maybeError.details,
      maybeError.hint,
      maybeError.code,
    ]
      .filter(Boolean)
      .join(" • ");
  }

  return "Authentifizierung fehlgeschlagen.";
}

async function ensureProfileForUser(userId: string, email: string | null, firstName?: string, lastName?: string) {
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return;

  const { error } = await supabase.from("profiles").insert({
    id: userId,
    contact_email: email,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
  });

  if (error) throw error;
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setSessionEmail(user?.email ?? null);
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setSessionEmail(session?.user?.email ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail) {
        throw new Error("Bitte gib deine E-Mail-Adresse ein.");
      }

      if (!password || password.length < 8) {
        throw new Error("Bitte gib ein Passwort mit mindestens 8 Zeichen ein.");
      }

      if (mode === "signup") {
        if (!firstName.trim() || !lastName.trim()) {
          throw new Error("Bitte Vorname und Nachname angeben.");
        }

        if (password !== confirmPassword) {
          throw new Error("Passwort und Passwort-Bestätigung stimmen nicht überein.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            },
          },
        });

        if (error) throw error;

        const signedUpUser = data.user;
        if (!signedUpUser) {
          throw new Error("Der Account konnte nicht sauber erstellt werden.");
        }

        await ensureProfileForUser(
          signedUpUser.id,
          signedUpUser.email ?? normalizedEmail,
          firstName.trim(),
          lastName.trim()
        );

        setSessionEmail(signedUpUser.email ?? normalizedEmail);
        setMessage("Account erstellt und eingeloggt.");
        router.push("/profile");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      if (data.user) {
        await ensureProfileForUser(data.user.id, data.user.email ?? normalizedEmail);
      }

      setSessionEmail(normalizedEmail);
      setMessage("Login erfolgreich.");
      router.push("/profile");
      router.refresh();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLogoutLoading(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setSessionEmail(null);
      setMessage("Du wurdest ausgeloggt.");
      router.refresh();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setLogoutLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              Backyrd Auth
            </div>

            <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
              Login und Registrierung im Backyrd Look.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-white/60 md:text-lg">
              Wir übernehmen die ruhige, hochwertige Auth-UX aus der App, aber als
              sauberen Web-Flow mit sofort funktionierendem E-Mail-und-Passwort-Login.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {["Spots speichern", "Freunden folgen", "Reviews schreiben", "Journey starten"].map(
                (chip) => (
                  <div
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75"
                  >
                    {chip}
                  </div>
                )
              )}
            </div>

            <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-white/55">
              <div className="font-medium text-white/85">Aktueller Status</div>
              <div className="mt-2">
                {sessionEmail ? `Eingeloggt als ${sessionEmail}` : "Aktuell nicht eingeloggt"}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-6 md:p-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold text-white">
                  {mode === "login" ? "Willkommen zurück" : "Account erstellen"}
                </h2>

                <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setMessage(null);
                      setErrorMessage(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      mode === "login"
                        ? "bg-white text-black"
                        : "text-white/65 hover:text-white"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setMessage(null);
                      setErrorMessage(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      mode === "signup"
                        ? "bg-white text-black"
                        : "text-white/65 hover:text-white"
                    }`}
                  >
                    Signup
                  </button>
                </div>
              </div>

              <p className="mt-3 text-sm leading-7 text-white/55">
                {mode === "login"
                  ? "Melde dich an, um deine Backyrd-Journey fortzusetzen."
                  : "Starte deine persönliche Backyrd Journey."}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {mode === "signup" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-white/65">Vorname</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Philipp"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm text-white/65">Nachname</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Langer"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm text-white/65">E-Mail</label>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="du@backyrd.app"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/65">Passwort</label>
                  <input
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 8 Zeichen"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  />
                </div>

                {mode === "signup" && (
                  <div>
                    <label className="mb-2 block text-sm text-white/65">
                      Passwort bestätigen
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Passwort wiederholen"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? "Bitte warten..."
                    : mode === "login"
                    ? "Einloggen"
                    : "Registrieren"}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-xs uppercase tracking-[0.22em] text-white/35">Konto</div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid gap-3">
                <Link
                  href="/profile"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Zum Profil
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
                >
                  {logoutLoading ? "Logout..." : "Logout"}
                </button>
              </div>

              {message && (
                <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100/90">
                  {message}
                </div>
              )}

              {errorMessage && (
                <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-7 text-red-100/85">
                  {errorMessage}
                </div>
              )}

              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/50">
                Google und Apple können wir danach sauber ergänzen. Erst kommt der
                robuste Basisflow für Web: Signup, Login, Session, Profil.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}