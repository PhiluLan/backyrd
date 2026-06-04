import "dotenv/config";
import { ConfigContext, ExpoConfig } from "@expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? "prod";
  const isDev = variant === "dev";

  return {
    ...config,
    name: isDev ? "Backyrd (dev)" : "Backyrd",
    slug: "backyrd",
    scheme: "backyrd",
    owner: "philipplanger",
    version: "1.0.0",

    runtimeVersion: {
      policy: "appVersion",
    },

    icon: "./assets/icon.png",

    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#0B0B0C",
    },

    ios: {
      bundleIdentifier: isDev ? "com.backyrd.app.dev" : "com.backyrd.app",
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
          "Backyrd nutzt deinen Standort, um passende Spots in deiner Nähe vorzuschlagen.",
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
      package: isDev ? "com.backyrd.app.dev" : "com.backyrd.app",
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

    plugins: ["expo-router", "expo-camera", "expo-secure-store", "expo-web-browser"],

    extra: {
      appVariant: variant,
      eas: {
        projectId: "7779ff79-6fa4-4d0e-b592-9c19c5f87881",
      },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      googleMapsKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
        "AIzaSyA7Mnx0hiFe4rrvtOd1Ya52NkM7WM-lXDI",
    },

    updates: {
      enabled: true,
      url: "https://u.expo.dev/7779ff79-6fa4-4d0e-b592-9c19c5f87881",
      fallbackToCacheTimeout: 0,
    },
  };
};