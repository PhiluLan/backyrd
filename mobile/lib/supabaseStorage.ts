import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { SupabaseAuthClientOptions } from "@supabase/supabase-js";

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
    return await SecureStore.getItemAsync(key);
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