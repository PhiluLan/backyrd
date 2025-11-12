import "dotenv/config";
import { ConfigContext, ExpoConfig } from "@expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Backyrd",
  slug: "backyrd",
  version: "1.0.0",
  runtimeVersion: {
    policy: "appVersion", // OTA Updates binden an App Version (z. B. 1.0.0)
  },
  owner: "philipplanger", // ✅ wichtig für OTA & EAS Updates
  scheme: "backyrd",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/icon.png",
    resizeMode: "contain",
    backgroundColor: "#0B0B0C",
  },
  ios: {
    bundleIdentifier: "com.backyrd.app",
    usesAppleSignIn: true,
    supportsTablet: false,
    autoFillCredentials: true,
    config: {
      googleMapsApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
        "AIzaSyA7Mnx0hiFe4rrvtOd1Ya52NkM7WM-lXDI",
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "Backyrd nutzt deinen Standort, um Spots in deiner Nähe zu zeigen.",
      NSCameraUsageDescription:
        "Backyrd benötigt die Kamera, um Fotos für Reviews aufzunehmen.",
      NSPhotoLibraryAddUsageDescription:
        "Backyrd speichert deine Review-Fotos in der Mediathek.",
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsArbitraryLoadsInWebContent: true,
      },
    },
  },
  android: {
    package: "com.backyrd.app",
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#0B0B0C",
    },
    config: {
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
          "AIzaSyA7Mnx0hiFe4rrvtOd1Ya52NkM7WM-lXDI",
      },
    },
    permissions: [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
    ],
  },
  plugins: [
    ["expo-router"], // 👈 Komma war hier entscheidend
    ["expo-camera"], // 📸 Kamera-Plugin korrekt eingebunden
    "expo-secure-store",
    "expo-web-browser",
  ],
  extra: {
    eas: {
      projectId: "7779ff79-6fa4-4d0e-b592-9c19c5f87881",
    },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleMapsKey:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
      "AIzaSyA7Mnx0hiFe4rrvtOd1Ya52NkM7WM-lXDI",
    openaiKey: process.env.EXPO_PUBLIC_OPENAI_KEY,
  },
  updates: {
    enabled: true,
    url: "https://u.expo.dev/7779ff79-6fa4-4d0e-b592-9c19c5f87881",
    fallbackToCacheTimeout: 0,
  },
});
