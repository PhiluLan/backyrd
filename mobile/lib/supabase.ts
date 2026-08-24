import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { secureStoreAdapter } from "./supabaseStorage";

const {
  supabaseUrl,
  supabaseAnonKey,
} = Constants.expoConfig?.extra ?? {};

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
