import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { setRecentDecisionActor } from "../lib/decision/recentDecisionSearch";
import { clearJourneySelection } from "../lib/discovery-journey";
import { supabase } from "../lib/supabase";
import { clearSupabaseAuthStorage } from "../lib/supabaseStorage";
import { withRequestDeadline } from "../lib/requestDeadline";

const SESSION_DEADLINE_MS = 8_000;

function isInvalidRefreshTokenError(error: unknown) {
  const message = String(
    (error as { message?: string } | null)?.message ?? error ?? ""
  ).toLowerCase();

  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("refresh_token_not_found")
  );
}

async function recoverFromInvalidRefreshToken() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    // Ein bereits ungültiger Refresh Token kann auch signOut fehlschlagen lassen.
    console.warn("Local Supabase sign-out during recovery failed:", error);
  }

  await clearSupabaseAuthStorage();
}

type AuthContextValue = {
  session: Session | null;
  user: Session["user"] | null;
  loading: boolean;
  startupFailed: boolean;
  retryStartup: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupFailed, setStartupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryStartup = React.useCallback(() => {
    setLoading(true);
    setStartupFailed(false);
    setAttempt(value => value + 1);
  }, []);
  useEffect(() => { clearJourneySelection(); }, [session?.user.id]);

  useEffect(() => {
    let mounted = true;
    let sessionChanged = false;
    function adoptSession(nextSession: Session | null) {
      setRecentDecisionActor(nextSession?.user.id ?? null);
      setSession(nextSession);
      setStartupFailed(false);
    }

    async function loadSession() {
      try {
        const nextSession = await withRequestDeadline(async (signal) => {
          try {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            return data.session;
          } catch (error) {
            if (signal.aborted || !mounted || sessionChanged || !isInvalidRefreshTokenError(error)) throw error;
            await recoverFromInvalidRefreshToken();
            return null;
          }
        }, SESSION_DEADLINE_MS);
        if (mounted && !sessionChanged) adoptSession(nextSession);
      } catch (error) {
        if (mounted && !sessionChanged) {
          console.warn("Session startup check failed", error);
          setStartupFailed(true);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!mounted || event === "INITIAL_SESSION") return;
      sessionChanged = true;
      adoptSession(currentSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [attempt]);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading: loading || startupFailed, startupFailed, retryStartup }),
    [loading, retryStartup, session, startupFailed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
