import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("Session fetch error:", error.message);
        if (mounted) setSession(data.session ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    // Initial laden
    loadSession();

    // Listener auf Login / Logout / TokenRefresh
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        setSession(currentSession ?? null);

        if (event === "SIGNED_IN") {
          await AsyncStorage.setItem("wasLoggedInBefore", "true");
        } else if (event === "SIGNED_OUT") {
          await AsyncStorage.removeItem("wasLoggedInBefore");
        }
      }
    );

    // AutoRefresh aktivieren
    supabase.auth.startAutoRefresh();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
