import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { secureStoreAdapter } from "./supabaseStorage";
import { supabaseRuntimeConfig } from "./supabaseRuntimeConfig";

export const runtimeConfigStatus = {
  valid: supabaseRuntimeConfig.valid,
};

// Never crash during module initialization. AppBootstrap prevents Product
// routes from rendering when release configuration is invalid.
const safeSupabaseUrl = runtimeConfigStatus.valid
  ? (supabaseRuntimeConfig.url as string)
  : "https://invalid.backyrd.local";
const safeSupabaseAnonKey = runtimeConfigStatus.valid
  ? (supabaseRuntimeConfig.anonKey as string)
  : "invalid-public-key";

export const supabaseRuntimeUrl = safeSupabaseUrl;
export const supabaseRuntimeAnonKey = safeSupabaseAnonKey;

export const supabase = createClient(supabaseRuntimeUrl, supabaseRuntimeAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "implicit",
  },
  // Erzwinge explizit das "public"-Schema, falls PostgREST auf ein anderes Schema (z. B. "net")
  // ausweichen würde und dadurch Fehler wie „schema "net" does not exist“ verursacht.
  db: {
    schema: "public",
  },
});

// A native process can remain alive while the app is backgrounded for hours.
// Keep the Auth refresh loop tied to foreground activity so a resumed Product
// request does not wait behind a stale background refresh. This module owns the
// single Supabase client, so this listener is registered exactly once.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
