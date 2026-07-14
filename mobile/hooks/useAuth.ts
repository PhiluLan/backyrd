import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  await AsyncStorage.removeItem("wasLoggedInBefore");
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let recovering = false;

    async function applyLoggedOutState() {
      if (mounted) setSession(null);
      await AsyncStorage.removeItem("wasLoggedInBefore");
    }

    async function recover(error: unknown) {
      if (recovering) return;
      recovering = true;

      try {
        console.warn(
          "Invalid Supabase refresh token detected. Clearing local session."
        );
        await recoverFromInvalidRefreshToken();
        await applyLoggedOutState();
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
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession ?? null);

      try {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await AsyncStorage.setItem("wasLoggedInBefore", "true");
        } else if (event === "SIGNED_OUT") {
          await AsyncStorage.removeItem("wasLoggedInBefore");
        }
      } catch (error) {
        console.warn("Auth state persistence failed:", error);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
  };
}
