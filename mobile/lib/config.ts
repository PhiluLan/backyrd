// mobile/lib/config.ts
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};
export const GOOGLE_KEY: string | undefined =
  (extra.googleMapsKey as string | undefined) ??
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
