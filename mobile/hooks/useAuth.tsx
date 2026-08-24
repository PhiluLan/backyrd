import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";
import { clearSupabaseAuthStorage } from "../lib/supabaseStorage";

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
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let recovering = false;

    async function recover(error: unknown) {
      if (recovering) return;
      recovering = true;

      try {
        console.warn(
          "Invalid Supabase refresh token detected. Clearing local session."
        );
        await recoverFromInvalidRefreshToken();
        if (mounted) setSession(null);
      } finally {
        recovering = false;
      }
    }

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await recover(error);
            return;
          }

          console.warn("Session fetch error:", error.message);
        }

        if (mounted) setSession(data.session ?? null);
      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await recover(error);
          return;
        }

        console.warn("Unexpected session fetch error:", error);
        if (mounted) setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
