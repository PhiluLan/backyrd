import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { secureStoreAdapter } from "./supabaseStorage";

// `expoConfig.extra` belongs to the installed native binary. An OTA update may
// carry a newer JS bundle but cannot retrofit missing native `extra` values.
// Public Expo runtime variables are compiled into that bundle, so retain the
// native values when present and use the bundled production values otherwise.
const nativeExtra = Constants.expoConfig?.extra ?? {};
const supabaseUrl = nativeExtra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = nativeExtra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const runtimeConfigStatus = {
  valid:
    typeof supabaseUrl === "string" &&
    supabaseUrl.startsWith("https://") &&
    typeof supabaseAnonKey === "string" &&
    supabaseAnonKey.length > 20,
  missing: [
    !supabaseUrl ? "Supabase URL" : null,
    !supabaseAnonKey ? "Supabase public key" : null,
  ].filter((value): value is string => Boolean(value)),
};

// Never crash during module initialization. AppBootstrap prevents Product
// routes from rendering when release configuration is invalid.
const safeSupabaseUrl = runtimeConfigStatus.valid
  ? (supabaseUrl as string)
  : "https://invalid.backyrd.local";
const safeSupabaseAnonKey = runtimeConfigStatus.valid
  ? (supabaseAnonKey as string)
  : "invalid-public-key";

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  // Erzwinge explizit das "public"-Schema, falls PostgREST auf ein anderes Schema (z. B. "net")
  // ausweichen würde und dadurch Fehler wie „schema "net" does not exist“ verursacht.
  db: {
    schema: "public",
  },
});
