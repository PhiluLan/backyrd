import Constants from "expo-constants";

type RuntimeValues = {
  url: unknown;
  anonKey: unknown;
};

function validPair(values: RuntimeValues) {
  const url = typeof values.url === "string" ? values.url.trim() : "";
  const anonKey = typeof values.anonKey === "string" ? values.anonKey.trim() : "";

  try {
    if (new URL(url).protocol !== "https:" || anonKey.length <= 20) return null;
  } catch {
    return null;
  }

  return { url, anonKey };
}

// Keep URL and public key from the same release source. An older native build
// may have empty Expo extra values; a complete, valid OTA pair can recover it.
// Never combine one source's URL with another source's key.
export function resolveSupabaseRuntimeConfig(native: RuntimeValues, update: RuntimeValues) {
  const pair = validPair(native) ?? validPair(update);
  return pair
    ? { valid: true as const, ...pair }
    : { valid: false as const, url: null, anonKey: null };
}

export const supabaseRuntimeConfig = resolveSupabaseRuntimeConfig(
  {
    url: Constants.expoConfig?.extra?.supabaseUrl,
    anonKey: Constants.expoConfig?.extra?.supabaseAnonKey,
  },
  {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  }
);
