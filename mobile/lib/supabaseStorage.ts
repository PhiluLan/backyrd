import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { SupabaseAuthClientOptions } from "@supabase/supabase-js";

function getSupabaseProjectRef() {
  const supabaseUrl = String(
    Constants.expoConfig?.extra?.supabaseUrl ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      ""
  ).trim();

  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function getKnownAuthStorageKeys() {
  const projectRef = getSupabaseProjectRef();
  if (!projectRef) return [];

  const base = `sb-${projectRef}-auth-token`;

  return [
    base,
    `${base}-code-verifier`,
  ];
}

const webStorage: SupabaseAuthClientOptions["storage"] = {
  getItem: async (key: string) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

const nativeStorage: SupabaseAuthClientOptions["storage"] = {
  getItem: async (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string) => {
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    await SecureStore.deleteItemAsync(key);
  },
};

export const secureStoreAdapter: SupabaseAuthClientOptions["storage"] =
  Platform.OS === "web" ? webStorage : nativeStorage;

/**
 * Entfernt ausschließlich die lokalen Supabase-Auth-Schlüssel dieses Projekts.
 * Wird verwendet, wenn Supabase einen veralteten oder bereits widerrufenen
 * Refresh Token meldet und signOut() den lokalen Zustand nicht mehr sauber
 * aufräumen kann.
 */
export async function clearSupabaseAuthStorage() {
  const knownKeys = getKnownAuthStorageKeys();

  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;

    const projectRef = getSupabaseProjectRef();
    const prefix = projectRef ? `sb-${projectRef}-auth-token` : "sb-";
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;

      if (
        key.startsWith(prefix) ||
        key.includes("auth-token") ||
        key.includes("code-verifier")
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    return;
  }

  await Promise.all(
    knownKeys.map(async (key) => {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        console.warn("Supabase auth storage cleanup failed:", key, error);
      }
    })
  );
}
