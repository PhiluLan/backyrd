import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { secureStoreAdapter } from "./supabaseStorage";

const {
  supabaseUrl,
  supabaseAnonKey,
} = Constants.expoConfig?.extra ?? {};

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ SUPABASE ENV FEHLT!", { supabaseUrl, supabaseAnonKey });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
